import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  RefreshResponse,
  User,
  UpdateUserRequest,
  Room,
  RoomMember,
  CreateRoomRequest,
  Message,
  MessagesPage,
  SendMessageRequest,
  PresignRequest,
  PresignResponse,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// ---------------------------------------------------------------------------
// Internal fetch wrapper
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let _accessToken: string | null = null;

/** Set the in-memory access token used by the API client. */
export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

/** Read the current in-memory access token. */
export function getAccessToken(): string | null {
  return _accessToken;
}

async function request<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;

  const headers = new Headers(fetchOptions.headers);
  headers.set("Content-Type", "application/json");

  if (!skipAuth && _accessToken) {
    headers.set("Authorization", `Bearer ${_accessToken}`);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
    credentials: "include", // send cookies for refresh token
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { message?: string; code?: string };
      if (body.message) message = body.message;
      if (body.code) code = body.code;
    } catch {
      // ignore JSON parse error
    }
    throw new ApiError(response.status, message, code);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export const auth = {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
      skipAuth: true,
    });
  },

  async login(data: LoginRequest): Promise<AuthResponse> {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
      skipAuth: true,
    });
  },

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    return request<RefreshResponse>("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
      skipAuth: true,
    });
  },

  async logout(refreshToken: string): Promise<void> {
    return request<void>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },
};

// ---------------------------------------------------------------------------
// Users API
// ---------------------------------------------------------------------------

export const users = {
  async me(): Promise<User> {
    return request<User>("/api/users/me");
  },

  async update(data: UpdateUserRequest): Promise<User> {
    return request<User>("/api/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  async get(id: string): Promise<User> {
    return request<User>(`/api/users/${encodeURIComponent(id)}`);
  },

  async search(q: string): Promise<User[]> {
    return request<User[]>(
      `/api/users/search?q=${encodeURIComponent(q)}`
    );
  },
};

// ---------------------------------------------------------------------------
// Rooms API
// ---------------------------------------------------------------------------

export const rooms = {
  async list(): Promise<Room[]> {
    return request<Room[]>("/api/rooms");
  },

  async create(data: CreateRoomRequest): Promise<Room> {
    return request<Room>("/api/rooms", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async get(id: string): Promise<Room> {
    return request<Room>(`/api/rooms/${encodeURIComponent(id)}`);
  },

  async getMembers(id: string): Promise<RoomMember[]> {
    return request<RoomMember[]>(
      `/api/rooms/${encodeURIComponent(id)}/members`
    );
  },
};

// ---------------------------------------------------------------------------
// Messages API
// ---------------------------------------------------------------------------

export const messages = {
  async list(roomId: string, cursor?: string): Promise<MessagesPage> {
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("before", cursor);
    return request<MessagesPage>(
      `/api/rooms/${encodeURIComponent(roomId)}/messages?${params.toString()}`
    );
  },

  async send(roomId: string, data: SendMessageRequest): Promise<Message> {
    return request<Message>(
      `/api/rooms/${encodeURIComponent(roomId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  },

  async read(messageId: string): Promise<void> {
    return request<void>(
      `/api/messages/${encodeURIComponent(messageId)}/read`,
      { method: "POST" }
    );
  },

  async edit(messageId: string, content: string): Promise<Message> {
    return request<Message>(
      `/api/messages/${encodeURIComponent(messageId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ content }),
      }
    );
  },

  async delete(messageId: string): Promise<void> {
    return request<void>(
      `/api/messages/${encodeURIComponent(messageId)}`,
      { method: "DELETE" }
    );
  },
};

// ---------------------------------------------------------------------------
// Media API
// ---------------------------------------------------------------------------

export const media = {
  async presign(data: PresignRequest): Promise<PresignResponse> {
    return request<PresignResponse>("/api/media/presign", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async uploadToS3(uploadUrl: string, file: File): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!response.ok) {
      throw new ApiError(response.status, "Failed to upload file to storage");
    }
  },
};

export { ApiError };
