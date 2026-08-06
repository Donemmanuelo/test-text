use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    handlers::messages::enrich_message,
    middleware::auth::AuthUser,
    models::message::Message,
    models::room::{
        AddMemberRequest, CreateRoomRequest, Room, RoomMember, RoomMemberRow,
        RoomMemberWithUser, RoomWithDetails,
    },
    models::user::PublicUser,
    AppState,
};

/// Verify caller is a member of the room; returns Forbidden if not.
async fn require_room_member(
    db: &sqlx::PgPool,
    room_id: Uuid,
    user_id: Uuid,
) -> AppResult<()> {
    let is_member: bool = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2)",
        room_id,
        user_id
    )
    .fetch_one(db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .unwrap_or(false);

    if !is_member {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

/// Build the client-facing room payload: members (with profiles), latest
/// non-deleted message, and the caller's unread count.
async fn load_room_details(
    db: &sqlx::PgPool,
    room: Room,
    user_id: Uuid,
) -> AppResult<RoomWithDetails> {
    let member_rows = sqlx::query_as!(
        RoomMemberRow,
        r#"SELECT rm.room_id, rm.user_id, rm.role, rm.joined_at,
                  u.display_name, u.avatar_url, u.status_message, u.last_seen_at
           FROM room_members rm
           JOIN users u ON u.id = rm.user_id
           WHERE rm.room_id = $1
           ORDER BY rm.joined_at"#,
        room.id
    )
    .fetch_all(db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    let members = member_rows
        .into_iter()
        .map(|r| RoomMemberWithUser {
            room_id: r.room_id,
            user_id: r.user_id,
            role: r.role,
            joined_at: r.joined_at,
            user: PublicUser {
                id: r.user_id,
                display_name: r.display_name,
                avatar_url: r.avatar_url,
                status_message: r.status_message,
                last_seen_at: r.last_seen_at,
            },
        })
        .collect::<Vec<_>>();

    let last_message = sqlx::query_as!(
        Message,
        r#"SELECT * FROM messages
           WHERE room_id = $1 AND deleted_at IS NULL
           ORDER BY created_at DESC
           LIMIT 1"#,
        room.id
    )
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    let last_message = match last_message {
        Some(m) => Some(enrich_message(db, m).await?),
        None => None,
    };

    let unread_count = sqlx::query_scalar!(
        r#"SELECT COUNT(*)
           FROM messages m
           WHERE m.room_id = $1
             AND m.sender_id <> $2
             AND m.deleted_at IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM message_reads r
               WHERE r.message_id = m.id AND r.user_id = $2
             )"#,
        room.id,
        user_id
    )
    .fetch_one(db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .unwrap_or(0);

    Ok(RoomWithDetails {
        id: room.id,
        name: room.name,
        is_group: room.is_group,
        created_by: room.created_by,
        created_at: room.created_at,
        members,
        last_message,
        unread_count,
    })
}

/// GET /api/rooms
pub async fn list_rooms(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
) -> AppResult<Json<Vec<RoomWithDetails>>> {
    let rooms = sqlx::query_as!(
        Room,
        r#"SELECT r.id, r.name, r.is_group, r.created_by, r.created_at
           FROM rooms r
           JOIN room_members rm ON rm.room_id = r.id
           WHERE rm.user_id = $1
           ORDER BY r.created_at DESC"#,
        auth.user_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    let mut out = Vec::with_capacity(rooms.len());
    for room in rooms {
        out.push(load_room_details(&state.db, room, auth.user_id).await?);
    }

    Ok(Json(out))
}

/// POST /api/rooms
pub async fn create_room(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateRoomRequest>,
) -> AppResult<(StatusCode, Json<RoomWithDetails>)> {
    if req.member_ids.is_empty() {
        return Err(AppError::BadRequest("member_ids cannot be empty".to_string()));
    }
    if !req.is_group && req.member_ids.len() != 1 {
        return Err(AppError::BadRequest(
            "Direct message rooms must have exactly one other member".to_string(),
        ));
    }

    // Reuse an existing 1:1 room between these two users instead of
    // creating a duplicate conversation.
    if !req.is_group {
        let other_id = req.member_ids[0];
        let existing = sqlx::query_as!(
            Room,
            r#"SELECT r.id, r.name, r.is_group, r.created_by, r.created_at
               FROM rooms r
               WHERE r.is_group = FALSE
                 AND EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = r.id AND rm.user_id = $1)
                 AND EXISTS (SELECT 1 FROM room_members rm WHERE rm.room_id = r.id AND rm.user_id = $2)
                 AND (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) = 2
               LIMIT 1"#,
            auth.user_id,
            other_id
        )
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

        if let Some(existing_room) = existing {
            tracing::info!(room_id = %existing_room.id, "Reused existing DM room");
            let details = load_room_details(&state.db, existing_room, auth.user_id).await?;
            return Ok((StatusCode::OK, Json(details)));
        }
    }

    let mut tx = state
        .db
        .begin()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let room = sqlx::query_as!(
        Room,
        r#"INSERT INTO rooms (name, is_group, created_by)
           VALUES ($1, $2, $3)
           RETURNING *"#,
        req.name,
        req.is_group,
        auth.user_id
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    // Add creator as admin
    sqlx::query!(
        r#"INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'admin')"#,
        room.id,
        auth.user_id
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    // Add other members
    for member_id in &req.member_ids {
        if *member_id == auth.user_id {
            continue;
        }
        sqlx::query!(
            r#"INSERT INTO room_members (room_id, user_id, role)
               VALUES ($1, $2, 'member')
               ON CONFLICT DO NOTHING"#,
            room.id,
            member_id
        )
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;
    }

    tx.commit().await.map_err(|e| AppError::Internal(e.into()))?;

    // Register room in hub for all currently-connected members
    for member_id in &req.member_ids {
        state.hub.join_room(*member_id, room.id);
    }
    state.hub.join_room(auth.user_id, room.id);

    let details = load_room_details(&state.db, room, auth.user_id).await?;

    tracing::info!(room_id = %details.id, created_by = %auth.user_id, "Room created");
    Ok((StatusCode::CREATED, Json(details)))
}

/// GET /api/rooms/:id
pub async fn get_room(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<Uuid>,
) -> AppResult<Json<RoomWithDetails>> {
    require_room_member(&state.db, room_id, auth.user_id).await?;

    let room = sqlx::query_as!(Room, "SELECT * FROM rooms WHERE id = $1", room_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::NotFound(format!("Room {room_id} not found")))?;

    Ok(Json(load_room_details(&state.db, room, auth.user_id).await?))
}

/// GET /api/rooms/:id/members
pub async fn list_members(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<Uuid>,
) -> AppResult<Json<Vec<RoomMember>>> {
    require_room_member(&state.db, room_id, auth.user_id).await?;

    let members = sqlx::query_as!(
        RoomMember,
        "SELECT * FROM room_members WHERE room_id = $1 ORDER BY joined_at",
        room_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(Json(members))
}

/// POST /api/rooms/:id/members
pub async fn add_member(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path(room_id): Path<Uuid>,
    Json(req): Json<AddMemberRequest>,
) -> AppResult<(StatusCode, Json<RoomMember>)> {
    // Only admins can add members
    let caller_role: Option<String> = sqlx::query_scalar!(
        "SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2",
        room_id,
        auth.user_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    match caller_role.as_deref() {
        Some("admin") => {}
        Some(_) => return Err(AppError::Forbidden),
        None => return Err(AppError::Forbidden),
    }

    // Check room is a group
    let is_group: bool = sqlx::query_scalar!(
        "SELECT is_group FROM rooms WHERE id = $1",
        room_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?
    .unwrap_or(false);

    if !is_group {
        return Err(AppError::BadRequest(
            "Cannot add members to a direct message room".to_string(),
        ));
    }

    let member = sqlx::query_as!(
        RoomMember,
        r#"INSERT INTO room_members (room_id, user_id, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (room_id, user_id) DO UPDATE SET role = EXCLUDED.role
           RETURNING *"#,
        room_id,
        req.user_id
    )
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    state.hub.join_room(req.user_id, room_id);

    tracing::info!(room_id = %room_id, user_id = %req.user_id, "Member added to room");
    Ok((StatusCode::CREATED, Json(member)))
}

/// DELETE /api/rooms/:id/members/:user_id
pub async fn remove_member(
    auth: AuthUser,
    State(state): State<Arc<AppState>>,
    Path((room_id, target_user_id)): Path<(Uuid, Uuid)>,
) -> AppResult<StatusCode> {
    // Must be admin OR removing yourself
    let caller_role: Option<String> = sqlx::query_scalar!(
        "SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2",
        room_id,
        auth.user_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    let is_admin = caller_role.as_deref() == Some("admin");
    let is_self = auth.user_id == target_user_id;

    if !is_admin && !is_self {
        return Err(AppError::Forbidden);
    }

    let deleted = sqlx::query!(
        "DELETE FROM room_members WHERE room_id = $1 AND user_id = $2",
        room_id,
        target_user_id
    )
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    if deleted.rows_affected() == 0 {
        return Err(AppError::NotFound("Member not found in room".to_string()));
    }

    tracing::info!(room_id = %room_id, user_id = %target_user_id, "Member removed from room");
    Ok(StatusCode::NO_CONTENT)
}
