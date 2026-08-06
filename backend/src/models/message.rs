use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::models::user::PublicUser;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Message {
    pub id: Uuid,
    pub room_id: Uuid,
    pub sender_id: Uuid,
    pub content: String,
    pub content_type: String,
    pub reply_to_id: Option<Uuid>,
    pub edited_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

/// Lightweight preview of the message being replied to (id, snippet, author).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplyPreview {
    pub id: Uuid,
    pub content: String,
    pub sender_name: String,
}

/// Message as sent to clients — includes the sender profile and read receipts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageWithDetails {
    pub id: Uuid,
    pub room_id: Uuid,
    pub sender_id: Uuid,
    pub content: String,
    pub content_type: String,
    pub reply_to_id: Option<Uuid>,
    pub reply_to: Option<ReplyPreview>,
    pub edited_at: Option<DateTime<Utc>>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub sender: PublicUser,
    pub read_by: Vec<Uuid>,
}

/// Paginated response for message history.
#[derive(Debug, Clone, Serialize)]
pub struct MessagesPage {
    pub messages: Vec<MessageWithDetails>,
    pub next_cursor: Option<Uuid>,
}

impl MessageWithDetails {
    pub fn from_message(
        msg: &Message,
        sender: PublicUser,
        read_by: Vec<Uuid>,
        reply_to: Option<ReplyPreview>,
    ) -> Self {
        Self {
            id: msg.id,
            room_id: msg.room_id,
            sender_id: msg.sender_id,
            content: msg.content.clone(),
            content_type: msg.content_type.clone(),
            reply_to_id: msg.reply_to_id,
            reply_to,
            edited_at: msg.edited_at,
            deleted_at: msg.deleted_at,
            created_at: msg.created_at,
            sender,
            read_by,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateMessageRequest {
    pub content: String,
    pub content_type: Option<String>,
    pub reply_to_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct EditMessageRequest {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct ListMessagesQuery {
    pub before: Option<Uuid>,
    pub limit: Option<i64>,
}
