"use client";

import { useEffect, useRef, useCallback } from "react";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { Spinner } from "@/components/ui/Spinner";
import { formatDateSeparator, isSameDay } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import type { Message, Room, User } from "@/lib/types";

interface MessageListProps {
  room: Room;
  messages: Message[];
  isLoading: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onMessageVisible: (messageId: string) => void;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message, content: string) => Promise<void>;
  onDelete?: (message: Message) => Promise<void>;
  isMessageBusy?: boolean;
  searchQuery?: string;
}

export function MessageList({
  room,
  messages,
  isLoading,
  hasMore,
  isFetchingMore,
  onLoadMore,
  onMessageVisible,
  onReply,
  onEdit,
  onDelete,
  isMessageBusy = false,
  searchQuery,
}: MessageListProps) {
  const currentUser = useAuthStore((s) => s.user) as User;
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);

  // Scroll to bottom on mount and when new messages arrive (if was at bottom)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isNewMessage = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (!isNewMessage) {
      // Initial load — scroll to bottom
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
      return;
    }

    // Only scroll down for new messages if user was already at the bottom
    if (wasAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Detect scroll position
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    wasAtBottomRef.current = distanceFromBottom < 80;

    // Load more when near top
    if (el.scrollTop < 80 && hasMore && !isFetchingMore) {
      onLoadMore();
    }
  }, [hasMore, isFetchingMore, onLoadMore]);

  // Preserve scroll position when prepending older messages
  const prevScrollHeightRef = useRef(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isFetchingMore) return;
    prevScrollHeightRef.current = el.scrollHeight;
  }, [isFetchingMore]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || isFetchingMore || prevScrollHeightRef.current === 0) return;
    const diff = el.scrollHeight - prevScrollHeightRef.current;
    if (diff > 0) {
      el.scrollTop += diff;
      prevScrollHeightRef.current = 0;
    }
  }, [messages, isFetchingMore]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size="lg" className="text-[#075e54]" />
      </div>
    );
  }

  // Client-side search filter for "search in chat"
  const visibleMessages = searchQuery
    ? messages.filter((m) =>
        m.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <p className="text-gray-400 text-sm">No messages yet.</p>
        <p className="text-gray-300 text-xs mt-1">Say hello! 👋</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto py-2"
      style={{ backgroundImage: "url(/chat-bg.png)", backgroundColor: "#efeae2" }}
    >
      {/* Load more indicator */}
      {isFetchingMore && (
        <div className="flex justify-center py-3">
          <Spinner size="sm" className="text-[#075e54]" />
        </div>
      )}

      {/* Load more trigger */}
      {hasMore && !isFetchingMore && (
        <div className="flex justify-center py-1">
          <button
            className="text-xs text-[#075e54] hover:underline"
            onClick={onLoadMore}
          >
            Load older messages
          </button>
        </div>
      )}

      {/* No search matches */}
      {searchQuery && visibleMessages.length === 0 && (
        <div className="flex justify-center py-10">
          <span className="text-sm text-gray-500 bg-white/80 rounded-full px-4 py-1.5 shadow-sm">
            No matching messages
          </span>
        </div>
      )}

      {/* Search results banner */}
      {searchQuery && visibleMessages.length > 0 && (
        <div className="flex justify-center py-2">
          <span className="text-xs text-gray-500 bg-white/80 rounded-full px-3 py-0.5 shadow-sm">
            {visibleMessages.length} matching message
            {visibleMessages.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Messages with date separators */}
      {visibleMessages.map((message, idx) => {
        const prevMessage = idx > 0 ? visibleMessages[idx - 1] : null;
        const showDateSep =
          !prevMessage || !isSameDay(prevMessage.created_at, message.created_at);

        const nextMessage =
          idx < visibleMessages.length - 1 ? visibleMessages[idx + 1] : null;
        const isLastInRun =
          !nextMessage || nextMessage.sender_id !== message.sender_id;

        const prevSameSender =
          prevMessage && prevMessage.sender_id === message.sender_id;
        const showAvatar =
          !prevSameSender && message.sender_id !== currentUser.id;

        return (
          <div key={message.id}>
            {showDateSep && (
              <div className="flex justify-center my-3">
                <span className="text-xs text-gray-500 bg-white/80 rounded-full px-3 py-0.5 shadow-sm">
                  {formatDateSeparator(message.created_at)}
                </span>
              </div>
            )}
            <div
              className={isLastInRun ? "mb-1" : "mb-0.5"}
              ref={(el) => {
                // Mark as read when visible
                if (
                  el &&
                  message.sender_id !== currentUser.id &&
                  !message.read_by.includes(currentUser.id)
                ) {
                  const observer = new IntersectionObserver(
                    (entries) => {
                      if (entries[0].isIntersecting) {
                        onMessageVisible(message.id);
                        observer.disconnect();
                      }
                    },
                    { threshold: 0.5 }
                  );
                  observer.observe(el);
                }
              }}
            >
              <MessageBubble
                message={message}
                currentUser={currentUser}
                isGroup={room.is_group}
                showAvatar={showAvatar}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
                isBusy={isMessageBusy}
              />
            </div>
          </div>
        );
      })}

      {/* Typing indicator */}
      <TypingIndicator room={room} />

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}
