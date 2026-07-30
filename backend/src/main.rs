use std::sync::Arc;

use anyhow::Result;
use aws_config::{BehaviorVersion, Region};
use aws_sdk_s3::config::Credentials;
use axum::{
    routing::{delete, get, patch, post},
    Router,
};
use deadpool_redis::Pool as RedisPool;
use sqlx::PgPool;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod config;
mod crypto;
mod db;
mod error;
mod handlers;
mod middleware;
mod models;
mod ws;

use crate::{
    config::Config,
    handlers::{auth, media, messages, rooms, users},
    ws::{handler::ws_handler, hub::Hub},
};

/// Shared application state injected into all handlers via Axum `State`.
pub struct AppState {
    pub db: PgPool,
    pub redis_pool: RedisPool,
    pub hub: Hub,
    pub s3_client: aws_sdk_s3::Client,
    pub config: Config,
}

#[tokio::main]
async fn main() -> Result<()> {
    // ── Tracing ────────────────────────────────────────────────────────────────
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // ── Config ─────────────────────────────────────────────────────────────────
    let config = Config::from_env()?;
    tracing::info!("Configuration loaded");

    // ── Database ───────────────────────────────────────────────────────────────
    let db = db::create_pool(&config.database_url).await?;

    // Run migrations
    tracing::info!("Running database migrations…");
    sqlx::migrate!("./migrations").run(&db).await?;
    tracing::info!("Migrations complete");

    // ── Redis ──────────────────────────────────────────────────────────────────
    let redis_cfg = deadpool_redis::Config::from_url(&config.redis_url);
    let redis_pool = redis_cfg
        .create_pool(Some(deadpool_redis::Runtime::Tokio1))
        .map_err(|e| anyhow::anyhow!("Failed to create Redis pool: {e}"))?;

    tracing::info!("Redis pool created");

    // ── WebSocket Hub ──────────────────────────────────────────────────────────
    let hub = Hub::new();
    let hub_arc = Arc::new(hub.clone());
    hub_arc.subscribe_redis(config.redis_url.clone());

    // ── S3 Client ──────────────────────────────────────────────────────────────
    let s3_creds = Credentials::new(
        &config.s3_access_key,
        &config.s3_secret_key,
        None,
        None,
        "env",
    );
    let s3_config = aws_config::defaults(BehaviorVersion::latest())
        .region(Region::new(config.s3_region.clone()))
        .credentials_provider(s3_creds)
        .endpoint_url(&config.s3_endpoint)
        .load()
        .await;
    let s3_client = aws_sdk_s3::Client::new(&s3_config);

    tracing::info!("S3 client initialized");

    // ── App State ──────────────────────────────────────────────────────────────
    let state = Arc::new(AppState {
        db,
        redis_pool,
        hub,
        s3_client,
        config: config.clone(),
    });

    // ── CORS ───────────────────────────────────────────────────────────────────
    let cors = CorsLayer::new()
        .allow_origin(
            config
                .cors_origin
                .parse::<axum::http::HeaderValue>()
                .unwrap_or(axum::http::HeaderValue::from_static("*")),
        )
        .allow_methods(Any)
        .allow_headers(Any);

    // ── Router ─────────────────────────────────────────────────────────────────
    let app = Router::new()
        // Auth
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/refresh", post(auth::refresh))
        .route("/api/auth/logout", post(auth::logout))
        // Users
        .route("/api/users/me", get(users::get_me).patch(users::update_me))
        .route("/api/users/search", get(users::search_users))
        .route("/api/users/:id", get(users::get_user))
        // Rooms
        .route("/api/rooms", get(rooms::list_rooms).post(rooms::create_room))
        .route("/api/rooms/:id", get(rooms::get_room))
        .route(
            "/api/rooms/:id/members",
            get(rooms::list_members).post(rooms::add_member),
        )
        .route(
            "/api/rooms/:id/members/:user_id",
            delete(rooms::remove_member),
        )
        // Messages
        .route(
            "/api/rooms/:id/messages",
            get(messages::list_messages).post(messages::create_message),
        )
        .route(
            "/api/messages/:id",
            patch(messages::edit_message).delete(messages::delete_message),
        )
        .route("/api/messages/:id/read", post(messages::read_message))
        // Media
        .route("/api/media/presign", post(media::presign_upload))
        // WebSocket
        .route("/api/ws", get(ws_handler))
        // Layers
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // ── Bind & Serve ───────────────────────────────────────────────────────────
    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Server listening on {addr}");

    axum::serve(listener, app).await?;

    Ok(())
}
