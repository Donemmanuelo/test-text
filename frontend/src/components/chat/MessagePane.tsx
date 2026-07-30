"use client";

import { useCallback } from "react";
import { ArrowLeft, MoreVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { Avatar } from "@/components/ui/Avatar";
import { PresenceBadge } from "./PresenceBadge";
import { useMessages } from "@/hooks/useMessages";
import { usePresence } from "@/hooks/usePresence";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import type { Room } from "@/lib/types";

interface MessagePaneProps {
  room: Room;
  onBack?: () => void;
}

export function MessagePane({ room, onBack }: MessagePaneProps) {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const clearUnread = useChatStore((s) => s.clearUnread);

  const {
    messages,
    isLoading,
    hasMore,
    isFetchingMore,
    loadOlder,
    sendMessage,
    isSending,
    markRead,
  } = useMessages(room.id);

  // For 1:1 chats, get presence of the other member
  const otherMember = !room.is_group
    ? room.members.find((m) => m.user_id !== currentUser?.id)?.user
    : undefined;

  const presence = usePresence(otherMember?.id);

  const displayName = room.is_group
    ? (room.name ?? "Group Chat")
    : (otherMember?.display_name ?? "Unknown");

  const avatarUrl = room.is_group ? null : (otherMember?.avatar_url ?? null);

  const headerSubtitle = room.is_group
    ? `${room.members.length} members`
    : presence.online
    ? "online"
    : presence.lastSeenText;

  const handleMessageVisible = useCallback(
    (messageId: string) => {
      markRead(messageId);
      clearUnread(room.id);
    },
    [markRead, clearUnread, room.id]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#075e54] text-white shadow-md shrink-0">
        {/* Back button (mobile) */}
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden p-1 rounded-full hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        <Avatar
          src={avatarUrl}
          name={displayName}
          size={38}
          showOnline={!room.is_group}
          online={presence.online}
          className="shrink-0"
        />

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{displayName}</p>
          <p className="text-xs text-white/75 leading-tight truncate mt-0.5">
            {headerSubtitle}
          </p>
        </div>

        <button
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Room options"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Message list */}
      <MessageList
        room={room}
        messages={messages}
        isLoading={isLoading}
        hasMore={hasMore}
        isFetchingMore={isFetchingMore}
        onLoadMore={loadOlder}
        onMessageVisible={handleMessageVisible}
      />

      {/* Composer */}
      <MessageComposer
        roomId={room.id}
        onSend={sendMessage}
        isSending={isSending}
      />
    </div>
  );
}
