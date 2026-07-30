import { useChatStore } from "@/store/chatStore";
import type { User } from "@/lib/types";
import { formatLastSeen } from "@/lib/utils";

/**
 * Returns presence info for a given user.
 */
export function usePresence(userId: string | undefined) {
  const presence = useChatStore((s) =>
    userId ? s.presence[userId] : undefined
  );

  if (!userId || !presence) {
    return { online: false, lastSeenText: "Unknown", lastSeen: null };
  }

  return {
    online: presence.online,
    lastSeenText: presence.online
      ? "online"
      : formatLastSeen(presence.last_seen),
    lastSeen: presence.last_seen,
  };
}

/**
 * Returns presence info for a room's other member (for 1:1 chats).
 */
export function useRoomPresence(otherUser: User | undefined) {
  return usePresence(otherUser?.id);
}

/**
 * Returns the list of user IDs currently typing in a room.
 */
export function useTypingUsers(roomId: string | undefined) {
  return useChatStore((s) => (roomId ? (s.typing[roomId] ?? []) : []));
}
