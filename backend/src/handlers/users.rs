use std::sync::Arc;

use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    models::user::{PublicUser, UpdateUserRequest, User, UserResponse},
    AppState,
};

/// GET /api/users/me
pub async fn get_me(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<UserResponse>> {
    let user = sqlx::query_as!(User, "SELECT * FROM users WHERE id = $1", auth.user_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::NotFound("User not found".to_string()))?;

    Ok(Json(user.into()))
}

/// PATCH /api/users/me
pub async fn update_me(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateUserRequest>,
) -> AppResult<Json<UserResponse>> {
    let user = sqlx::query_as!(
        User,
        r#"UPDATE users
           SET
             display_name   = COALESCE($2, display_name),
             avatar_url     = COALESCE($3, avatar_url),
             status_message = COALESCE($4, status_message),
             updated_at     = NOW()
           WHERE id = $1
           RETURNING *"#,
        auth.user_id,
        req.display_name,
        req.avatar_url,
        req.status_message,
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    tracing::info!(user_id = %auth.user_id, "User profile updated");
    Ok(Json(user.into()))
}

/// GET /api/users/:id
pub async fn get_user(
    _auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(user_id): Path<Uuid>,
) -> AppResult<Json<PublicUser>> {
    let user = sqlx::query_as!(
        PublicUser,
        r#"SELECT id, display_name, avatar_url, status_message, last_seen_at
           FROM users WHERE id = $1"#,
        user_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .ok_or_else(|| AppError::NotFound(format!("User {user_id} not found")))?;

    Ok(Json(user))
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

/// GET /api/users/search?q=...
pub async fn search_users(
    _auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Query(query): Query<SearchQuery>,
) -> AppResult<Json<Vec<PublicUser>>> {
    if query.q.trim().is_empty() {
        return Err(AppError::BadRequest("Search query cannot be empty".to_string()));
    }

    let pattern = format!("%{}%", query.q.to_lowercase());

    let users = sqlx::query_as!(
        PublicUser,
        r#"SELECT id, display_name, avatar_url, status_message, last_seen_at
           FROM users
           WHERE LOWER(display_name) LIKE $1
              OR LOWER(email) LIKE $1
           LIMIT 50"#,
        pattern
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(users))
}
