use axum::{
    async_trait,
<<<<<<< HEAD
    extract::{FromRequestParts, State},
=======
    extract::{FromRequestParts},
>>>>>>> df6da1af1e9d36c895807f8f4e0696d78f606c9c
    http::request::Parts,
    RequestPartsExt,
};
use axum_extra::{
    headers::{authorization::Bearer, Authorization},
    TypedHeader,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

<<<<<<< HEAD
use crate::{error::AppError, AppState};
=======
use crate::{error::AppError, App};
>>>>>>> df6da1af1e9d36c895807f8f4e0696d78f606c9c

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub exp: i64,
    pub iat: i64,
}

/// Extractor that validates the Bearer JWT and returns the authenticated user's UUID.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub claims: Claims,
}

#[async_trait]
<<<<<<< HEAD
impl FromRequestParts<std::sync::Arc<AppState>> for AuthUser {
=======
impl FromRequestParts<std::sync::Arc<App>> for AuthUser {
>>>>>>> df6da1af1e9d36c895807f8f4e0696d78f606c9c
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
<<<<<<< HEAD
        state: &std::sync::Arc<AppState>,
=======
        state: &std::sync::Arc<App>,
>>>>>>> df6da1af1e9d36c895807f8f4e0696d78f606c9c
    ) -> Result<Self, Self::Rejection> {
        let TypedHeader(Authorization(bearer)) = parts
            .extract::<TypedHeader<Authorization<Bearer>>>()
            .await
            .map_err(|_| AppError::Unauthorized("Missing or invalid Authorization header".to_string()))?;

        let token = bearer.token();

        let decoding_key = DecodingKey::from_secret(state.config.jwt_secret.as_bytes());
        let validation = Validation::default();

        let token_data = decode::<Claims>(token, &decoding_key, &validation).map_err(|e| {
            tracing::warn!("JWT validation failed: {e}");
            AppError::Unauthorized("Invalid or expired token".to_string())
        })?;

        Ok(AuthUser {
            user_id: token_data.claims.sub,
            claims: token_data.claims,
        })
    }
}
}
