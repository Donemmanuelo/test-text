use std::collections::HashSet;
use std::sync::Arc;

use dashmap::DashMap;
use futures::StreamExt;
use redis::{aio::ConnectionManager, AsyncCommands, Client};
use tokio::sync::mpsc;
use uuid::Uuid;

use crate::ws::events::WsEvent;

const REDIS_WS_CHANNEL: &str = "ws:events";
const WS_CHANNEL_CAPACITY: usize = 128;

/// Holds all live WebSocket connections and provides broadcast helpers.
#[derive(Debug, Default, Clone)]
pub struct Hub {
    /// user_id → sender channel for that user's WS connection
    pub connections: Arc<DashMap<Uuid, mpsc::Sender<WsEvent>>>,
    /// room_id → set of user_ids currently connected in that room
    pub room_members: Arc<DashMap<Uuid, HashSet<Uuid>>>,
}

impl Hub {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(DashMap::new()),
            room_members: Arc::new(DashMap::new()),
        }
    }

    /// Register a user connection; returns the receiver end of the event channel.
    pub fn connect(&self, user_id: Uuid) -> mpsc::Receiver<WsEvent> {
        let (tx, rx) = mpsc::channel(WS_CHANNEL_CAPACITY);
        self.connections.insert(user_id, tx);
        rx
    }

    /// Remove a user's connection and clean up room membership.
    pub fn disconnect(&self, user_id: Uuid) {
        self.connections.remove(&user_id);
        for mut entry in self.room_members.iter_mut() {
            entry.value_mut().remove(&user_id);
        }
        tracing::info!(user_id = %user_id, "WebSocket disconnected");
    }

    /// Track that a user is a member of a room.
    pub fn join_room(&self, user_id: Uuid, room_id: Uuid) {
        self.room_members
            .entry(room_id)
            .or_default()
            .insert(user_id);
    }

    /// Broadcast an event to all connected members of a room.
    pub fn broadcast_to_room(&self, room_id: Uuid, event: WsEvent) {
        let Some(members) = self.room_members.get(&room_id) else {
            return;
        };
        for &user_id in members.iter() {
            self.send_to_user(user_id, event.clone());
        }
    }

    /// Send an event to a single connected user (non-blocking, drops if buffer full).
    pub fn send_to_user(&self, user_id: Uuid, event: WsEvent) {
        if let Some(tx) = self.connections.get(&user_id) {
            if let Err(e) = tx.try_send(event) {
                tracing::warn!(user_id = %user_id, "Dropped WS event (buffer full): {e}");
            }
        }
    }

    /// Publish an event to Redis for cross-instance broadcast.
    pub async fn publish_to_redis(&self, conn: &mut ConnectionManager, event: &WsEvent) {
        match serde_json::to_string(event) {
            Ok(payload) => {
                if let Err(e) = conn.publish::<_, _, ()>(REDIS_WS_CHANNEL, &payload).await {
                    tracing::error!("Failed to publish to Redis: {e}");
                }
            }
            Err(e) => {
                tracing::error!("Failed to serialize WS event: {e}");
            }
        }
    }

    /// Spawn a background task that subscribes to Redis pub/sub and fans out
    /// events to local WebSocket connections.
    pub fn subscribe_redis(self: Arc<Self>, redis_url: String) {
        tokio::spawn(async move {
            loop {
                match redis_subscribe_inner(self.clone(), &redis_url).await {
                    Ok(()) => {
                        tracing::info!("Redis pub/sub task ended normally, restarting");
                    }
                    Err(e) => {
                        tracing::error!("Redis pub/sub error: {e}. Reconnecting in 2s…");
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    }
                }
            }
        });
    }
}

async fn redis_subscribe_inner(hub: Arc<Hub>, redis_url: &str) -> anyhow::Result<()> {
    let client = Client::open(redis_url)?;
    let mut pubsub_conn = client.get_async_pubsub().await?;
    pubsub_conn.subscribe(REDIS_WS_CHANNEL).await?;
    tracing::info!("Subscribed to Redis channel '{REDIS_WS_CHANNEL}'");

    let mut stream = pubsub_conn.on_message();

    while let Some(msg) = stream.next().await {
        let payload: String = match msg.get_payload() {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("Failed to decode Redis pub/sub message: {e}");
                continue;
            }
        };

        // Try to extract room_id from payload for targeted routing
        let value: serde_json::Value = match serde_json::from_str(&payload) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("Failed to parse Redis WS event JSON: {e}");
                continue;
            }
        };

        let event: WsEvent = match serde_json::from_value(value.clone()) {
            Ok(e) => e,
            Err(e) => {
                tracing::warn!("Failed to deserialize Redis WS event: {e}");
                continue;
            }
        };

        // Route by room_id when present in the payload
        let room_id = value
            .get("payload")
            .and_then(|p| p.get("room_id"))
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<Uuid>().ok());

        if let Some(room_id) = room_id {
            hub.broadcast_to_room(room_id, event);
        } else {
            // Presence updates etc. — broadcast to all connected users
            for entry in hub.connections.iter() {
                hub.send_to_user(*entry.key(), event.clone());
            }
        }
    }

    Ok(())
}
