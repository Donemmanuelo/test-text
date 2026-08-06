"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Info,
  LogOut,
  MoreVertical,
  Phone,
  Search as SearchIcon,
  Video,
  X,
} from "lucide-react";
import { MessageList } from "./MessageList";
import { MessageComposer } from "./MessageComposer";
import { ChatInfoModal } from "./ChatInfoModal";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { useMessages } from "@/hooks/useMessages";
import { usePresence } from "@/hooks/usePresence";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { useSettingsStore } from "@/store/settingsStore";
import { rooms as roomsApi } from "@/lib/api";
import { startCall } from "@/lib/rtc";
import { cn } from "@/lib/utils";
import type { Message, Room } from "@/lib/types";

interface MessagePaneProps {
  room: Room;
  onBack?: () => void;
}

export function MessagePane({ room, onBack }: MessagePaneProps) {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const clearUnread = useChatStore((s) => s.clearUnread);
  const mutedRooms = useSettingsStore((s) => s.mutedRooms);
  const toggleMuteRoom = useSettingsStore((s) => s.toggleMuteRoom);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const {
    messages,
    isLoading,
    hasMore,
    isFetchingMore,
    loadOlder,
    sendMessage,
    isSending,
    markRead,
    editMessage,
    isEditing,
    deleteMessage,
    isDeleting,
  } = useMessages(room.id);

  // Message currently being replied to
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);

  const handleEdit = useCallback(
    async (message: Message, content: string) => {
      await editMessage({ messageId: message.id, content });
    },
    [editMessage]
  );

  const handleDelete = useCallback(
    async (message: Message) => {
      await deleteMessage(message.id);
    },
    [deleteMessage]
  );

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

  const isMuted = mutedRooms.includes(room.id);

  const handleMessageVisible = useCallback(
    (messageId: string) => {
      markRead(messageId);
      clearUnread(room.id);
    },
    [markRead, clearUnread, room.id]
  );

  const handleLeave = async () => {
    if (!currentUser) return;
    setLeaving(true);
    try {
      await roomsApi.removeMember(room.id, currentUser.id);
      router.push("/chat");
    } catch {
      setLeaving(false);
      setConfirmingLeave(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="relative flex items-center gap-3 px-4 py-2.5 bg-[#075e54] text-white shadow-md shrink-0">
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
            {isMuted && !room.is_group ? "Muted · " : ""}
            {headerSubtitle}
          </p>
        </div>

        {/* Voice / video call buttons (1:1 chats only) */}
        {otherMember && (
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                startCall(otherMember.id, otherMember.display_name ?? "Unknown", "voice")
              }
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              aria-label="Voice call"
            >
              <Phone className="w-5 h-5" />
            </button>
            <button
              onClick={() =>
                startCall(otherMember.id, otherMember.display_name ?? "Unknown", "video")
              }
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              aria-label="Video call"
            >
              <Video className="w-5 h-5" />
            </button>
          </div>
        )}

        <button
          onClick={() => setSearchOpen((v) => !v)}
          className={cn(
            "p-2 rounded-full hover:bg-white/10 transition-colors",
            searchOpen && "bg-white/15"
          )}
          aria-label="Search in chat"
        >
          <SearchIcon className="w-5 h-5" />
        </button>

        <button
          onClick={() => {
            setConfirmingLeave(false);
            setMenuOpen((v) => !v);
          }}
          className={cn(
            "p-2 rounded-full hover:bg-white/10 transition-colors",
            menuOpen && "bg-white/15"
          )}
          aria-label="Room options"
        >
          <MoreVertical className="w-5 h-5" />
        </button>

        {/* Header menu */}
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => {
                setConfirmingLeave(false);
                setMenuOpen(false);
              }}
            />
            <div className="absolute top-14 right-4 z-30 min-w-[200px] rounded-xl bg-white shadow-xl border border-gray-100 py-1">
              <button
                onClick={() => {
                  setShowInfo(true);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Info className="w-4 h-4 text-gray-500" />
                {room.is_group ? "Group info" : "Contact info"}
              </button>
              <button
                onClick={() => {
                  setSearchOpen(true);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                <SearchIcon className="w-4 h-4 text-gray-500" />
                Search in chat
              </button>
              <button
                onClick={() => {
                  toggleMuteRoom(room.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                {isMuted ? (
                  <Bell className="w-4 h-4 text-gray-500" />
                ) : (
                  <BellOff className="w-4 h-4 text-gray-500" />
                )}
                {isMuted ? "Unmute notifications" : "Mute notifications"}
              </button>
              <div className="my-1 border-t border-gray-100" />
              <button
                onClick={() => {
                  if (!confirmingLeave) {
                    setConfirmingLeave(true);
                    return;
                  }
                  handleLeave();
                }}
                disabled={leaving}
                className={cn(
                  "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 disabled:opacity-60",
                  confirmingLeave ? "text-red-600 font-medium" : "text-red-500"
                )}
              >
                <LogOut className="w-4 h-4" />
                {confirmingLeave
                  ? room.is_group
                    ? "Confirm leave group?"
                    : "Confirm delete chat?"
                  : room.is_group
                  ? "Leave group"
                  : "Delete chat"}
                {leaving && <Spinner size="sm" />}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
          <SearchIcon className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 text-sm outline-none placeholder:text-gray-400"
          />
          {searchQuery && (
            <span className="text-xs text-gray-400 shrink-0">
              {messages.filter((m) =>
                m.content.toLowerCase().includes(searchQuery.toLowerCase())
              ).length}{" "}
              results
            </span>
          )}
          <button
            onClick={() => {
              setSearchQuery("");
              setSearchOpen(false);
            }}
            className="p-1 text-gray-400 hover:text-gray-600"
            aria-label="Close search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Message list */}
      <MessageList
        room={room}
        messages={messages}
        isLoading={isLoading}
        hasMore={hasMore}
        isFetchingMore={isFetchingMore}
        onLoadMore={loadOlder}
        onMessageVisible={handleMessageVisible}
        onReply={(msg) => setReplyTarget(msg)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        isMessageBusy={isEditing || isDeleting}
        searchQuery={searchQuery.trim() || undefined}
      />

      {/* Composer */}
      <MessageComposer
        roomId={room.id}
        onSend={sendMessage}
        isSending={isSending}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
      />

      {/* Info modal */}
      {showInfo && currentUser && (
        <ChatInfoModal
          room={room}
          currentUser={currentUser}
          onClose={() => setShowInfo(false)}
        />
      )}
    </div>
  );
}
