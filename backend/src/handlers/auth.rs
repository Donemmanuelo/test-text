use std::sync::Arc;

use axum::{extract::State, http::StatusCode, Json};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::Claims,
    models::user::{User, UserResponse},
    AppState,
};

// ── Request/Response types ───────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub display_name: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Deserialize)]
pub struct LogoutRequest {
    pub refresh_token: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub user: UserResponse,
    pub access_token: String,
    pub refresh_token: String,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn generate_access_token(
    user_id: Uuid,
    jwt_secret: &str,
    expiry_seconds: u64,
) -> AppResult<String> {
    let now = Utc::now();
    let exp = (now + Duration::seconds(expiry_seconds as i64)).timestamp();
    let claims = Claims {
        sub: user_id,
        exp,
        iat: now.timestamp(),
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow::anyhow!("JWT encode error: {e}")))
}

fn generate_refresh_token() -> String {
    use rand::Rng;
    let bytes: [u8; 32] = rand::thread_rng().gen();
    hex::encode(bytes)
}

fn verify_password(password: &str, hash: &str) -> AppResult<bool> {
    use argon2::{Argon2, PasswordHash, PasswordVerifier};
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid password hash: {e}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

fn hash_password(password: &str) -> AppResult<String> {
    use argon2::{
        password_hash::{rand_core::OsRng, SaltString},
        Argon2, PasswordHasher,
    };
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Password hash error: {e}")))
}

fn validate_email(email: &str) -> bool {
    email.contains('@') && email.contains('.') && email.len() >= 5
}

// ── Handlers ─────────────────────────────────────────────────────────────────

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterRequest>,
) -> AppResult<(StatusCode, Json<AuthResponse>)> {
    // Validate inputs
    if !validate_email(&req.email) {
        return Err(AppError::BadRequest("Invalid email format".to_string()));
    }
    if req.password.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".to_string(),
        ));
    }
    if req.display_name.trim().is_empty() {
        return Err(AppError::BadRequest("display_name cannot be empty".to_string()));
    }

    let email = req.email.to_lowercase();

    // Check uniqueness
    let exists: bool = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)",
        email
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .unwrap_or(false);

    if exists {
        return Err(AppError::Conflict("Email already registered".to_string()));
    }

    let password_hash = hash_password(&req.password)?;

    let user = sqlx::query_as!(
        User,
        r#"INSERT INTO users (email, display_name, password_hash)
           VALUES ($1, $2, $3)
           RETURNING *"#,
        email,
        req.display_name.trim(),
        password_hash
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    tracing::info!(user_id = %user.id, email = %user.email, "User registered");

    let access_token = generate_access_token(
        user.id,
        &state.config.jwt_secret,
        state.config.access_token_expiry_seconds,
    )?;
    let refresh_token_raw = generate_refresh_token();
    let token_hash = hash_token(&refresh_token_raw);
    let expires_at = Utc::now() + Duration::days(state.config.refresh_token_expiry_days as i64);

    sqlx::query!(
        r#"INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3)"#,
        user.id,
        token_hash,
        expires_at
    )
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok((
        StatusCode::CREATED,
        Json(AuthResponse {
            user: user.into(),
            access_token,
            refresh_token: refresh_token_raw,
        }),
    ))
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> AppResult<Json<AuthResponse>> {
    let email = req.email.to_lowercase();

    let user = sqlx::query_as!(User, "SELECT * FROM users WHERE email = $1", email)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::Unauthorized("Invalid email or password".to_string()))?;

    if !verify_password(&req.password, &user.password_hash)? {
        return Err(AppError::Unauthorized("Invalid email or password".to_string()));
    }

    tracing::info!(user_id = %user.id, "User logged in");

    let access_token = generate_access_token(
        user.id,
        &state.config.jwt_secret,
        state.config.access_token_expiry_seconds,
    )?;
    let refresh_token_raw = generate_refresh_token();
    let token_hash = hash_token(&refresh_token_raw);
    let expires_at = Utc::now() + Duration::days(state.config.refresh_token_expiry_days as i64);

    sqlx::query!(
        r#"INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3)"#,
        user.id,
        token_hash,
        expires_at
    )
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(AuthResponse {
        user: user.into(),
        access_token,
        refresh_token: refresh_token_raw,
    }))
}

pub async fn refresh(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RefreshRequest>,
) -> AppResult<Json<AuthResponse>> {
    let token_hash = hash_token(&req.refresh_token);

    // Look up and validate the token
    let row = sqlx::query!(
        r#"SELECT id, user_id, expires_at, revoked_at
           FROM refresh_tokens
           WHERE token_hash = $1"#,
        token_hash
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .ok_or_else(|| AppError::Unauthorized("Invalid refresh token".to_string()))?;

    if row.revoked_at.is_some() {
        return Err(AppError::Unauthorized("Refresh token has been revoked".to_string()));
    }
    if row.expires_at < Utc::now() {
        return Err(AppError::Unauthorized("Refresh token has expired".to_string()));
    }

    // Revoke old token (rotation)
    sqlx::query!(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1",
        row.id
    )
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    // Fetch user
    let user = sqlx::query_as!(User, "SELECT * FROM users WHERE id = $1", row.user_id)
        .fetch_one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    // Issue new pair
    let access_token = generate_access_token(
        user.id,
        &state.config.jwt_secret,
        state.config.access_token_expiry_seconds,
    )?;
    let refresh_token_raw = generate_refresh_token();
    let new_hash = hash_token(&refresh_token_raw);
    let expires_at = Utc::now() + Duration::days(state.config.refresh_token_expiry_days as i64);

    sqlx::query!(
        r#"INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, $3)"#,
        user.id,
        new_hash,
        expires_at
    )
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    tracing::info!(user_id = %user.id, "Refresh token rotated");

    Ok(Json(AuthResponse {
        user: user.into(),
        access_token,
        refresh_token: refresh_token_raw,
    }))
}

pub async fn logout(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LogoutRequest>,
) -> AppResult<StatusCode> {
    let token_hash = hash_token(&req.refresh_token);

    let updated = sqlx::query!(
        "UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL",
        token_hash
    )
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    if updated.rows_affected() == 0 {
        // Token not found or already revoked — treat as success for security
        tracing::warn!("Logout called with unknown/already-revoked token");
    }

    Ok(StatusCode::NO_CONTENT)
}
