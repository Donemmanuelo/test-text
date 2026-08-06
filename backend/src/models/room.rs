use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::models::{message::MessageWithDetails, user::PublicUser};

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Room {
    pub id: Uuid,
    pub name: Option<String>,
    pub is_group: bool,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct RoomMember {
    pub room_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub joined_at: DateTime<Utc>,
}

/// Room as sent to clients — includes members (with profiles), latest message,
/// and the caller's unread count.
#[derive(Debug, Clone, Serialize)]
pub struct RoomWithDetails {
    pub id: Uuid,
    pub name: Option<String>,
    pub is_group: bool,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
    pub members: Vec<RoomMemberWithUser>,
    pub last_message: Option<MessageWithDetails>,
    pub unread_count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct RoomMemberWithUser {
    pub room_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub joined_at: DateTime<Utc>,
    pub user: PublicUser,
}

/// Flat row produced by the room_members JOIN users query.
#[derive(Debug, FromRow)]
pub struct RoomMemberRow {
    pub room_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub joined_at: DateTime<Utc>,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub status_message: Option<String>,
    pub last_seen_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoomRequest {
    pub name: Option<String>,
    pub member_ids: Vec<Uuid>,
    pub is_group: bool,
}

#[derive(Debug, Deserialize)]
pub struct AddMemberRequest {
    pub user_id: Uuid,
}
