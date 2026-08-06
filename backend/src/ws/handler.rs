use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message as WsMessage, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
};
use chrono::Utc;
use deadpool_redis::redis::AsyncCommands;
use futures::{SinkExt, StreamExt};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    error::AppError,
    middleware::auth::Claims,
    ws::events::{
        CallAnswerPayload, CallEndPayload, CallIcePayload, CallOfferPayload, ClientEvent,
        PresenceUpdatePayload, TypingPayload, WsEvent,
    },
    AppState,
};

const PRESENCE_TTL_SECONDS: i64 = 65;
const PRESENCE_KEY_PREFIX: &str = "presence:";

#[derive(Deserialize)]
pub struct WsQuery {
    pub token: String,
}

/// WebSocket upgrade handler — validates JWT via query param, registers in hub.
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<WsQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let decoding_key = DecodingKey::from_secret(state.config.jwt_secret.as_bytes());
    let token_data =
        decode::<Claims>(&query.token, &decoding_key, &Validation::default()).map_err(|e| {
            tracing::warn!("WS JWT validation failed: {e}");
            AppError::Unauthorized("Invalid or expired token".to_string())
        })?;

    let user_id = token_data.claims.sub;

    // Load rooms this user belongs to
    let room_ids: Vec<Uuid> = sqlx::query_scalar!(
        "SELECT room_id FROM room_members WHERE user_id = $1",
        user_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(ws.on_upgrade(move |socket| handle_socket(socket, user_id, room_ids, state)))
}

async fn handle_socket(
    socket: WebSocket,
    user_id: Uuid,
    room_ids: Vec<Uuid>,
    state: Arc<AppState>,
) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Register user in hub and get event receiver
    let mut event_rx = state.hub.connect(user_id);

    // Join all rooms in the hub
    for &room_id in &room_ids {
        state.hub.join_room(user_id, room_id);
    }

    // Mark presence online in Redis
    set_presence_online(&state, user_id).await;

    // Broadcast presence.update { online: true }
    let online_event = WsEvent::PresenceUpdate(PresenceUpdatePayload {
        user_id,
        online: true,
        last_seen: Some(Utc::now()),
    });
    for &room_id in &room_ids {
        state.hub.broadcast_to_room(room_id, online_event.clone());
    }

    // Task A: forward hub events → WS
    let mut send_task = tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            match serde_json::to_string(&event) {
                Ok(json) => {
                    if ws_sender.send(WsMessage::Text(json)).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    tracing::error!("Failed to serialize WS event: {e}");
                }
            }
        }
    });

    // Task B: receive events ← WS
    let state_recv = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(msg_result) = ws_receiver.next().await {
            match msg_result {
                Ok(WsMessage::Text(text)) => {
                    handle_client_event(&state_recv, user_id, &text).await;
                }
                Ok(WsMessage::Close(_)) | Err(_) => break,
                _ => {}
            }
        }
    });

    // Wait until either task ends (connection closed)
    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    // ── Cleanup ────────────────────────────────────────────────────────────────
    state.hub.disconnect(user_id);

    // Update last_seen_at
    let _ = sqlx::query!(
        "UPDATE users SET last_seen_at = NOW() WHERE id = $1",
        user_id
    )
    .execute(&state.db)
    .await;

    // Delete presence key from Redis
    if let Ok(mut conn) = state.redis_pool.get().await {
        let key = format!("{PRESENCE_KEY_PREFIX}{user_id}");
        let _: Result<(), _> = conn.del::<_, ()>(&key).await;
    }

    // Broadcast offline
    let offline_event = WsEvent::PresenceUpdate(PresenceUpdatePayload {
        user_id,
        online: false,
        last_seen: Some(Utc::now()),
    });

    if let Ok(ids) = sqlx::query_scalar!(
        "SELECT room_id FROM room_members WHERE user_id = $1",
        user_id
    )
    .fetch_all(&state.db)
    .await
    {
        for room_id in ids {
            state.hub.broadcast_to_room(room_id, offline_event.clone());
        }
    }

    tracing::info!(user_id = %user_id, "WebSocket session ended");
}

async fn handle_client_event(state: &Arc<AppState>, user_id: Uuid, text: &str) {
    let event = match serde_json::from_str::<ClientEvent>(text) {
        Ok(e) => e,
        Err(e) => {
            tracing::warn!(user_id = %user_id, "Invalid client WS event: {e}");
            return;
        }
    };

    match event {
        ClientEvent::TypingStart { room_id } => {
            let ws_event = WsEvent::TypingStart(TypingPayload { user_id, room_id });
            state.hub.broadcast_to_room(room_id, ws_event.clone());
            publish_event_to_redis(state, &ws_event).await;
        }
        ClientEvent::TypingStop { room_id } => {
            let ws_event = WsEvent::TypingStop(TypingPayload { user_id, room_id });
            state.hub.broadcast_to_room(room_id, ws_event.clone());
            publish_event_to_redis(state, &ws_event).await;
        }
        ClientEvent::PresencePing => {
            set_presence_online(state, user_id).await;
        }
        // ── Call signaling (peer-to-peer, routed to the target user) ──────────
        ClientEvent::CallOffer {
            target_user_id,
            sdp,
            mode,
        } => {
            state.hub.send_to_user(
                target_user_id,
                WsEvent::CallOffer(CallOfferPayload {
                    caller_id: user_id,
                    sdp,
                    mode,
                }),
            );
        }
        ClientEvent::CallAnswer { target_user_id, sdp } => {
            state.hub.send_to_user(
                target_user_id,
                WsEvent::CallAnswer(CallAnswerPayload { callee_id: user_id, sdp }),
            );
        }
        ClientEvent::CallIce { target_user_id, candidate } => {
            state.hub.send_to_user(
                target_user_id,
                WsEvent::CallIce(CallIcePayload { user_id, candidate }),
            );
        }
        ClientEvent::CallEnd { target_user_id } => {
            state.hub.send_to_user(
                target_user_id,
                WsEvent::CallEnd(CallEndPayload { user_id }),
            );
        }
        ClientEvent::CallDecline { target_user_id } => {
            state.hub.send_to_user(
                target_user_id,
                WsEvent::CallDecline(CallEndPayload { user_id }),
            );
        }
    }
}

async fn set_presence_online(state: &Arc<AppState>, user_id: Uuid) {
    if let Ok(mut conn) = state.redis_pool.get().await {
        let key = format!("{PRESENCE_KEY_PREFIX}{user_id}");
        let _: Result<(), _> = conn.set_ex::<_, _, ()>(&key, "1", PRESENCE_TTL_SECONDS as u64).await;
    }
}

async fn publish_event_to_redis(state: &Arc<AppState>, event: &WsEvent) {
    if let Ok(mut conn) = state.redis_pool.get().await {
        if let Ok(json) = serde_json::to_string(event) {
            let _: Result<(), _> = conn.publish::<_, _, ()>("ws:events", &json).await;
        }
    }
}
