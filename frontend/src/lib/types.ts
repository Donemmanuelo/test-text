export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  status_message: string | null;
  created_at: string;
  last_seen_at: string | null;
}

export interface Room {
  id: string;
  name: string | null;
  is_group: boolean;
  created_by: string;
  created_at: string;
  members: RoomMember[];
  last_message: Message | null;
  unread_count: number;
}

export interface RoomMember {
  user_id: string;
  room_id: string;
  role: "admin" | "member";
  joined_at: string;
  user: User;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  content_type: "text" | "image" | "file" | "audio";
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  sender: User;
  read_by: string[];
}

export type WsEvent =
  | { type: "message.new"; payload: Message }
  | { type: "message.edited"; payload: Message }
  | { type: "message.deleted"; payload: { id: string; room_id: string } }
  | {
      type: "message.status";
      payload: {
        message_id: string;
        user_id: string;
        status: "delivered" | "read";
      };
    }
  | {
      type: "presence.update";
      payload: { user_id: string; online: boolean; last_seen: string };
    }
  | { type: "typing.start"; payload: { user_id: string; room_id: string } }
  | { type: "typing.stop"; payload: { user_id: string; room_id: string } };

export type WsClientEvent =
  | { type: "presence.ping" }
  | { type: "typing.start"; payload: { room_id: string } }
  | { type: "typing.stop"; payload: { room_id: string } };

// API request/response types
export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  refresh_token: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export interface UpdateUserRequest {
  display_name?: string;
  avatar_url?: string;
  status_message?: string;
}

export interface CreateRoomRequest {
  name?: string;
  member_ids: string[];
  is_group: boolean;
}

export interface SendMessageRequest {
  content: string;
  content_type: "text" | "image" | "file" | "audio";
  reply_to_id?: string;
}

export interface PresignRequest {
  filename: string;
  content_type: string;
  room_id: string;
}

export interface PresignResponse {
  upload_url: string;
  file_url: string;
}

export interface MessagesPage {
  messages: Message[];
  next_cursor: string | null;
}

export interface ApiError {
  message: string;
  code?: string;
}

export interface PresenceState {
  [userId: string]: {
    online: boolean;
    last_seen: string;
  };
}

export interface TypingState {
  [roomId: string]: string[]; // array of user_ids currently typing
}
