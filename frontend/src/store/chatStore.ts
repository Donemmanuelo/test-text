import { create } from "zustand";
import type { Room, Message, PresenceState, TypingState } from "@/lib/types";

interface ChatState {
  // Room list
  rooms: Room[];
  setRooms: (rooms: Room[]) => void;
  upsertRoom: (room: Room) => void;

  // Messages per room (roomId → sorted array)
  messages: Record<string, Message[]>;
  setMessages: (roomId: string, msgs: Message[]) => void;
  prependMessages: (roomId: string, msgs: Message[]) => void;
  appendMessage: (msg: Message) => void;
  updateMessage: (msg: Message) => void;
  deleteMessage: (messageId: string, roomId: string) => void;
  markMessageRead: (messageId: string, userId: string) => void;

  // Cursors for pagination (roomId → oldest cursor seen)
  cursors: Record<string, string | null>;
  setCursor: (roomId: string, cursor: string | null) => void;

  // Presence
  presence: PresenceState;
  setPresence: (userId: string, online: boolean, lastSeen: string) => void;

  // Typing indicators
  typing: TypingState;
  setTyping: (roomId: string, userId: string, isTyping: boolean) => void;

  // Active room
  activeRoomId: string | null;
  setActiveRoomId: (id: string | null) => void;

  // Unread counts
  incrementUnread: (roomId: string) => void;
  clearUnread: (roomId: string) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  rooms: [],
  messages: {},
  cursors: {},
  presence: {},
  typing: {},
  activeRoomId: null,
};

export const useChatStore = create<ChatState>()((set) => ({
  ...initialState,

  setRooms: (rooms) => set({ rooms }),

  upsertRoom: (room) =>
    set((state) => {
      const idx = state.rooms.findIndex((r) => r.id === room.id);
      if (idx === -1) {
        return { rooms: [room, ...state.rooms] };
      }
      const next = [...state.rooms];
      next[idx] = room;
      return { rooms: next };
    }),

  setMessages: (roomId, msgs) =>
    set((state) => ({
      messages: { ...state.messages, [roomId]: msgs },
    })),

  prependMessages: (roomId, msgs) =>
    set((state) => {
      const existing = state.messages[roomId] ?? [];
      // Avoid duplicates
      const existingIds = new Set(existing.map((m) => m.id));
      const fresh = msgs.filter((m) => !existingIds.has(m.id));
      return {
        messages: { ...state.messages, [roomId]: [...fresh, ...existing] },
      };
    }),

  appendMessage: (msg) =>
    set((state) => {
      const existing = state.messages[msg.room_id] ?? [];
      // Avoid duplicates
      if (existing.some((m) => m.id === msg.id)) return state;
      return {
        messages: {
          ...state.messages,
          [msg.room_id]: [...existing, msg],
        },
        // Update last_message on the room
        rooms: state.rooms.map((r) =>
          r.id === msg.room_id ? { ...r, last_message: msg } : r
        ),
      };
    }),

  updateMessage: (msg) =>
    set((state) => {
      const existing = state.messages[msg.room_id] ?? [];
      return {
        messages: {
          ...state.messages,
          [msg.room_id]: existing.map((m) => (m.id === msg.id ? msg : m)),
        },
      };
    }),

  deleteMessage: (messageId, roomId) =>
    set((state) => {
      const existing = state.messages[roomId] ?? [];
      return {
        messages: {
          ...state.messages,
          [roomId]: existing.map((m) =>
            m.id === messageId
              ? { ...m, deleted_at: new Date().toISOString() }
              : m
          ),
        },
      };
    }),

  markMessageRead: (messageId, userId) =>
    set((state) => {
      // Find which room contains this message
      for (const [roomId, msgs] of Object.entries(state.messages)) {
        const idx = msgs.findIndex((m) => m.id === messageId);
        if (idx !== -1) {
          const msg = msgs[idx];
          if (msg.read_by.includes(userId)) return state; // already read
          const updated = {
            ...msg,
            read_by: [...msg.read_by, userId],
          };
          const next = [...msgs];
          next[idx] = updated;
          return {
            messages: { ...state.messages, [roomId]: next },
          };
        }
      }
      return state;
    }),

  setCursor: (roomId, cursor) =>
    set((state) => ({
      cursors: { ...state.cursors, [roomId]: cursor },
    })),

  setPresence: (userId, online, lastSeen) =>
    set((state) => ({
      presence: {
        ...state.presence,
        [userId]: { online, last_seen: lastSeen },
      },
    })),

  setTyping: (roomId, userId, isTyping) =>
    set((state) => {
      const current = state.typing[roomId] ?? [];
      const next = isTyping
        ? current.includes(userId)
          ? current
          : [...current, userId]
        : current.filter((id) => id !== userId);
      return { typing: { ...state.typing, [roomId]: next } };
    }),

  setActiveRoomId: (activeRoomId) => set({ activeRoomId }),

  incrementUnread: (roomId) =>
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, unread_count: r.unread_count + 1 } : r
      ),
    })),

  clearUnread: (roomId) =>
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, unread_count: 0 } : r
      ),
    })),

  reset: () => set(initialState),
}));
