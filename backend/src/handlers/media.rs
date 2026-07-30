use std::sync::Arc;

use aws_sdk_s3::presigning::PresigningConfig;
use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    middleware::auth::AuthUser,
    AppState,
};

const PRESIGN_EXPIRY_SECONDS: u64 = 300; // 5 minutes

#[derive(Deserialize)]
pub struct PresignRequest {
    pub filename: String,
    pub content_type: String,
    pub room_id: Uuid,
}

#[derive(Serialize)]
pub struct PresignResponse {
    pub upload_url: String,
    pub file_url: String,
    pub key: String,
}

/// POST /api/media/presign
pub async fn presign_upload(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(req): Json<PresignRequest>,
) -> AppResult<Json<PresignResponse>> {
    if req.filename.trim().is_empty() {
        return Err(AppError::BadRequest("filename cannot be empty".to_string()));
    }
    if req.content_type.trim().is_empty() {
        return Err(AppError::BadRequest("content_type cannot be empty".to_string()));
    }

    // Verify caller is a member of the room
    let is_member: bool = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2)",
        req.room_id,
        auth.user_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .unwrap_or(false);

    if !is_member {
        return Err(AppError::Forbidden);
    }

    // Generate a unique S3 key
    let ext = req.filename.rsplit('.').next().unwrap_or("bin");
    let key = format!(
        "rooms/{}/{}/{}.{ext}",
        req.room_id,
        auth.user_id,
        Uuid::new_v4()
    );

    let presigning_config = PresigningConfig::builder()
        .expires_in(std::time::Duration::from_secs(PRESIGN_EXPIRY_SECONDS))
        .build()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Presign config error: {e}")))?;

    let presigned = state
        .s3_client
        .put_object()
        .bucket(&state.config.s3_bucket)
        .key(&key)
        .content_type(&req.content_type)
        .presigned(presigning_config)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("S3 presign error: {e}")))?;

    let upload_url = presigned.uri().to_string();

    // Construct public file URL
    let file_url = format!(
        "{}/{}/{}",
        state.config.s3_endpoint.trim_end_matches('/'),
        state.config.s3_bucket,
        key
    );

    // Record media entry in DB
    sqlx::query!(
        r#"INSERT INTO media (room_id, uploader_id, filename, content_type, s3_key, file_url)
           VALUES ($1, $2, $3, $4, $5, $6)"#,
        req.room_id,
        auth.user_id,
        req.filename,
        req.content_type,
        key,
        file_url
    )
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    tracing::info!(
        user_id = %auth.user_id,
        room_id = %req.room_id,
        key = %key,
        "Media presign URL generated"
    );

    Ok(Json(PresignResponse {
        upload_url,
        file_url,
        key,
    }))
}
