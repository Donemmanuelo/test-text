//! Health-check handler.
//!
//! GET /health → 200 OK `{ "status": "ok" }`
//!
//! This endpoint is called by Railway (see railway.toml healthcheckPath) every
//! 30 seconds to determine whether the instance is alive. Keep it cheap —
//! no database calls; just confirm the process is responsive.

use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

/// Liveness probe handler.
pub async fn health_handler() -> impl IntoResponse {
    (StatusCode::OK, Json(json!({ "status": "ok" })))
}
