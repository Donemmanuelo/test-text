use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::message::Message;

// ── Outbound events (server → client) ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum WsEvent {
    #[serde(rename = "message.new")]
    MessageNew(Message),

    #[serde(rename = "message.edited")]
    MessageEdited(Message),

    #[serde(rename = "message.deleted")]
    MessageDeleted(MessageDeletedPayload),

    #[serde(rename = "message.status")]
    MessageStatus(MessageStatusPayload),

    #[serde(rename = "presence.update")]
    PresenceUpdate(PresenceUpdatePayload),

    #[serde(rename = "typing.start")]
    TypingStart(TypingPayload),

    #[serde(rename = "typing.stop")]
    TypingStop(TypingPayload),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageDeletedPayload {
    pub id: Uuid,
    pub room_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageStatusPayload {
    pub message_id: Uuid,
    pub user_id: Uuid,
    pub status: MessageStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    Delivered,
    Read,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresenceUpdatePayload {
    pub user_id: Uuid,
    pub online: bool,
    pub last_seen: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypingPayload {
    pub user_id: Uuid,
    pub room_id: Uuid,
}

// ── Inbound events (client → server) ────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientEvent {
    #[serde(rename = "typing.start")]
    TypingStart { room_id: Uuid },

    #[serde(rename = "typing.stop")]
    TypingStop { room_id: Uuid },

    #[serde(rename = "presence.ping")]
    PresencePing,
}
