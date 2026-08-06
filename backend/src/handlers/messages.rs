use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use deadpool_redis::redis::AsyncCommands;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    models::message::{
        CreateMessageRequest, EditMessageRequest, ListMessagesQuery, Message, MessageWithDetails,
        MessagesPage, ReplyPreview,
    },
    models::user::PublicUser,
    ws::events::{
        MessageDeletedPayload, MessageStatus, MessageStatusPayload, WsEvent,
    },
    AppState,
};

const DEFAULT_PAGE_LIMIT: i64 = 50;
const MAX_PAGE_LIMIT: i64 = 100;
const WS_EVENTS_CHANNEL: &str = "ws:events";

async fn require_room_member(
    db: &sqlx::PgPool,
    room_id: Uuid,
    user_id: Uuid,
) -> AppResult<()> {
    let is_member: bool = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2)",
        room_id,
        user_id
    )
    .fetch_one(db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .unwrap_or(false);

    if !is_member {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

async fn publish_ws_event(state: &Arc<AppState>, event: &WsEvent) {
    if let Ok(mut conn) = state.redis_pool.get().await {
        if let Ok(json) = serde_json::to_string(event) {
            let _: Result<(), _> = conn.publish::<_, _, ()>(WS_EVENTS_CHANNEL, &json).await;
        }
    }
}

/// Enrich a raw message row with the sender profile and read receipts so the
/// client contract (sender, read_by) is satisfied.
pub(crate) async fn enrich_message(
    db: &sqlx::PgPool,
    msg: Message,
) -> AppResult<MessageWithDetails> {
    let sender = sqlx::query_as!(
        PublicUser,
        r#"SELECT id, display_name, avatar_url, status_message, last_seen_at
           FROM users WHERE id = $1"#,
        msg.sender_id
    )
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .unwrap_or_else(|| PublicUser {
        id: msg.sender_id,
        display_name: "Unknown".to_string(),
        avatar_url: None,
        status_message: None,
        last_seen_at: None,
    });

    let read_by = sqlx::query_scalar!(
        "SELECT user_id FROM message_reads WHERE message_id = $1",
        msg.id
    )
    .fetch_all(db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    let reply_to = match msg.reply_to_id {
        Some(reply_id) => {
            let row = sqlx::query!(
                r#"SELECT m.content, m.deleted_at, u.display_name
                   FROM messages m
                   JOIN users u ON u.id = m.sender_id
                   WHERE m.id = $1"#,
                reply_id
            )
            .fetch_optional(db)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;

            row.map(|r| ReplyPreview {
                id: reply_id,
                content: if r.deleted_at.is_some() {
                    "This message was deleted".to_string()
                } else {
                    r.content
                },
                sender_name: r.display_name,
            })
        }
        None => None,
    };

    Ok(MessageWithDetails::from_message(
        &msg, sender, read_by, reply_to,
    ))
}

/// GET /api/rooms/:id/messages?before=<uuid>&limit=50
pub async fn list_messages(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<Uuid>,
    Query(query): Query<ListMessagesQuery>,
) -> AppResult<Json<MessagesPage>> {
    require_room_member(&state.db, room_id, auth.user_id).await?;

    let limit = query
        .limit
        .unwrap_or(DEFAULT_PAGE_LIMIT)
        .min(MAX_PAGE_LIMIT)
        .max(1);

    let messages = match query.before {
        Some(cursor_id) => {
            sqlx::query_as!(
                Message,
                r#"SELECT m.*
                   FROM messages m
                   WHERE m.room_id = $1
                     AND m.created_at < (SELECT created_at FROM messages WHERE id = $2)
                   ORDER BY m.created_at DESC
                   LIMIT $3"#,
                room_id,
                cursor_id,
                limit
            )
            .fetch_all(&state.db)
            .await
            .map_err(|e| AppError::Internal(e.into()))?
        }
        None => {
            sqlx::query_as!(
                Message,
                r#"SELECT * FROM messages
                   WHERE room_id = $1
                   ORDER BY created_at DESC
                   LIMIT $2"#,
                room_id,
                limit
            )
            .fetch_all(&state.db)
            .await
            .map_err(|e| AppError::Internal(e.into()))?
        }
    };

    let mut enriched = Vec::with_capacity(messages.len());
    for msg in messages {
        enriched.push(enrich_message(&state.db, msg).await?);
    }

    // If we fetched a full page, the oldest message's id is the cursor for
    // the next (older) page. A short page means there is nothing more.
    let next_cursor = if enriched.len() as i64 == limit {
        enriched.last().map(|m| m.id)
    } else {
        None
    };

    Ok(Json(MessagesPage {
        messages: enriched,
        next_cursor,
    }))
}

/// POST /api/rooms/:id/messages
pub async fn create_message(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<Uuid>,
    Json(req): Json<CreateMessageRequest>,
) -> AppResult<(StatusCode, Json<MessageWithDetails>)> {
    require_room_member(&state.db, room_id, auth.user_id).await?;

    if req.content.trim().is_empty() {
        return Err(AppError::BadRequest("Message content cannot be empty".to_string()));
    }

    let content_type = req.content_type.as_deref().unwrap_or("text").to_string();
    let valid_content_types = ["text", "image", "file", "audio", "video"];
    if !valid_content_types.contains(&content_type.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Invalid content_type '{content_type}'. Must be one of: {valid_content_types:?}"
        )));
    }

    if let Some(reply_id) = req.reply_to_id {
        let valid: bool = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM messages WHERE id = $1 AND room_id = $2)",
            reply_id,
            room_id
        )
        .fetch_one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .unwrap_or(false);

        if !valid {
            return Err(AppError::BadRequest("reply_to_id not found in this room".to_string()));
        }
    }

    let message = sqlx::query_as!(
        Message,
        r#"INSERT INTO messages (room_id, sender_id, content, content_type, reply_to_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
        room_id,
        auth.user_id,
        req.content,
        content_type,
        req.reply_to_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    let enriched = enrich_message(&state.db, message).await?;

    let event = WsEvent::MessageNew(enriched.clone());
    state.hub.broadcast_to_room(room_id, event.clone());
    publish_ws_event(&state, &event).await;

    tracing::info!(
        room_id = %room_id,
        message_id = %enriched.id,
        sender_id = %auth.user_id,
        "Message created"
    );

    Ok((StatusCode::CREATED, Json(enriched)))
}

/// PATCH /api/messages/:id
pub async fn edit_message(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<Uuid>,
    Json(req): Json<EditMessageRequest>,
) -> AppResult<Json<MessageWithDetails>> {
    if req.content.trim().is_empty() {
        return Err(AppError::BadRequest("Message content cannot be empty".to_string()));
    }

    let existing = sqlx::query_as!(Message, "SELECT * FROM messages WHERE id = $1", message_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::NotFound(format!("Message {message_id} not found")))?;

    if existing.sender_id != auth.user_id {
        return Err(AppError::Forbidden);
    }
    if existing.deleted_at.is_some() {
        return Err(AppError::BadRequest("Cannot edit a deleted message".to_string()));
    }

    let updated = sqlx::query_as!(
        Message,
        "UPDATE messages SET content = $2, edited_at = NOW() WHERE id = $1 RETURNING *",
        message_id,
        req.content
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    let enriched = enrich_message(&state.db, updated).await?;

    let event = WsEvent::MessageEdited(enriched.clone());
    state.hub.broadcast_to_room(existing.room_id, event.clone());
    publish_ws_event(&state, &event).await;

    tracing::info!(message_id = %message_id, "Message edited");
    Ok(Json(enriched))
}

/// DELETE /api/messages/:id  (soft delete)
pub async fn delete_message(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let existing = sqlx::query_as!(Message, "SELECT * FROM messages WHERE id = $1", message_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::NotFound(format!("Message {message_id} not found")))?;

    if existing.sender_id != auth.user_id {
        let is_admin: bool = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2 AND role = 'admin')",
            existing.room_id,
            auth.user_id
        )
        .fetch_one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .unwrap_or(false);

        if !is_admin {
            return Err(AppError::Forbidden);
        }
    }

    if existing.deleted_at.is_some() {
        return Ok(StatusCode::NO_CONTENT);
    }

    sqlx::query!(
        "UPDATE messages SET deleted_at = NOW() WHERE id = $1",
        message_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    let event = WsEvent::MessageDeleted(MessageDeletedPayload {
        id: message_id,
        room_id: existing.room_id,
    });
    state.hub.broadcast_to_room(existing.room_id, event.clone());
    publish_ws_event(&state, &event).await;

    tracing::info!(message_id = %message_id, "Message soft-deleted");
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/messages/:id/read
pub async fn read_message(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(message_id): Path<Uuid>,
) -> AppResult<StatusCode> {
    let msg = sqlx::query_as!(Message, "SELECT * FROM messages WHERE id = $1", message_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::NotFound(format!("Message {message_id} not found")))?;

    require_room_member(&state.db, msg.room_id, auth.user_id).await?;

    sqlx::query!(
        r#"INSERT INTO message_reads (message_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = NOW()"#,
        message_id,
        auth.user_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    let event = WsEvent::MessageStatus(MessageStatusPayload {
        message_id,
        user_id: auth.user_id,
        status: MessageStatus::Read,
    });
    state.hub.broadcast_to_room(msg.room_id, event.clone());
    publish_ws_event(&state, &event).await;

    Ok(StatusCode::NO_CONTENT)
}
