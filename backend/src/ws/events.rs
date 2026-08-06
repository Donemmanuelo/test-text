use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::message::MessageWithDetails;

// ── Outbound events (server → client) ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum WsEvent {
    #[serde(rename = "message.new")]
    MessageNew(MessageWithDetails),

    #[serde(rename = "message.edited")]
    MessageEdited(MessageWithDetails),

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

    #[serde(rename = "call.offer")]
    CallOffer(CallOfferPayload),

    #[serde(rename = "call.answer")]
    CallAnswer(CallAnswerPayload),

    #[serde(rename = "call.ice")]
    CallIce(CallIcePayload),

    #[serde(rename = "call.end")]
    CallEnd(CallEndPayload),

    #[serde(rename = "call.decline")]
    CallDecline(CallEndPayload),
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

// ── Call signaling payloads ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CallMode {
    Voice,
    Video,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallOfferPayload {
    pub caller_id: Uuid,
    pub sdp: String,
    pub mode: CallMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallAnswerPayload {
    pub callee_id: Uuid,
    pub sdp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallIcePayload {
    pub user_id: Uuid,
    pub candidate: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallEndPayload {
    pub user_id: Uuid,
}

// ── Inbound events (client → server) ────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum ClientEvent {
    #[serde(rename = "typing.start")]
    TypingStart { room_id: Uuid },

    #[serde(rename = "typing.stop")]
    TypingStop { room_id: Uuid },

    #[serde(rename = "presence.ping")]
    PresencePing,

    #[serde(rename = "call.offer")]
    CallOffer {
        target_user_id: Uuid,
        sdp: String,
        mode: CallMode,
    },

    #[serde(rename = "call.answer")]
    CallAnswer { target_user_id: Uuid, sdp: String },

    #[serde(rename = "call.ice")]
    CallIce { target_user_id: Uuid, candidate: String },

    #[serde(rename = "call.end")]
    CallEnd { target_user_id: Uuid },

    #[serde(rename = "call.decline")]
    CallDecline { target_user_id: Uuid },
}
