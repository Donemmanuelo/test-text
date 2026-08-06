"use client";

import { useRouter } from "next/navigation";
import { cn, truncate, formatRoomTime } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { useAuthStore } from "@/store/authStore";
import { usePresence } from "@/hooks/usePresence";
import { useSettingsStore } from "@/store/settingsStore";
import type { Room } from "@/lib/types";

interface RoomItemProps {
  room: Room;
  isActive: boolean;
}

export function RoomItem({ room, isActive }: RoomItemProps) {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const showPreviews = useSettingsStore((s) => s.showPreviews);

  // For 1:1 chats, show the other member
  const otherMember = !room.is_group
    ? room.members.find((m) => m.user_id !== currentUser?.id)?.user
    : undefined;

  const displayName =
    room.is_group
      ? (room.name ?? "Group Chat")
      : (otherMember?.display_name ?? "Unknown");

  const avatarUrl = room.is_group ? null : (otherMember?.avatar_url ?? null);

  const presence = usePresence(otherMember?.id);

  const lastMessagePreview = room.last_message
    ? room.last_message.deleted_at
      ? "Message deleted"
      : !showPreviews
      ? "New message"
      : room.last_message.content_type === "image"
      ? "📷 Photo"
      : room.last_message.content_type === "file"
      ? "📎 File"
      : room.last_message.content_type === "audio"
      ? "🎵 Audio"
      : truncate(room.last_message.content, 45)
    : "No messages yet";

  const lastTime = formatRoomTime(
    room.last_message?.created_at ?? room.created_at
  );

  return (
    <button
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left",
        isActive && "bg-gray-100 hover:bg-gray-100"
      )}
      onClick={() => router.push(`/chat/${room.id}`)}
      aria-current={isActive ? "page" : undefined}
    >
      {/* Avatar */}
      <Avatar
        src={avatarUrl}
        name={displayName}
        size={46}
        showOnline={!room.is_group}
        online={presence.online}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium text-sm text-gray-900 truncate">
            {displayName}
          </span>
          <span className="text-xs text-gray-400 shrink-0">{lastTime}</span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-sm text-gray-400 truncate">
            {lastMessagePreview}
          </span>
          {room.unread_count > 0 && (
            <span className="shrink-0 min-w-[20px] h-5 flex items-center justify-center
              rounded-full bg-[#25d366] text-white text-[10px] font-bold px-1.5">
              {room.unread_count > 99 ? "99+" : room.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
