use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// Full user row (never sent in full to clients — password_hash excluded from responses)
#[derive(Debug, Clone, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub status_message: Option<String>,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_seen_at: Option<DateTime<Utc>>,
}

/// What the authenticated user sees for themselves
#[derive(Debug, Clone, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub status_message: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_seen_at: Option<DateTime<Utc>>,
}

impl From<User> for UserResponse {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            email: u.email,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            status_message: u.status_message,
            created_at: u.created_at,
            updated_at: u.updated_at,
            last_seen_at: u.last_seen_at,
        }
    }
}

/// What other users see
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PublicUser {
    pub id: Uuid,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub status_message: Option<String>,
    pub last_seen_at: Option<DateTime<Utc>>,
}

impl From<User> for PublicUser {
    fn from(u: User) -> Self {
        Self {
            id: u.id,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            status_message: u.status_message,
            last_seen_at: u.last_seen_at,
        }
    }
}

/// Request body for updating own profile
#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub status_message: Option<String>,
}
