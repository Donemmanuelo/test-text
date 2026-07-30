"use client";

import { Check, CheckCheck } from "lucide-react";
import { cn, formatMessageTime } from "@/lib/utils";
import type { Message, User } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";

interface MessageBubbleProps {
  message: Message;
  currentUser: User;
  isGroup: boolean;
  showAvatar: boolean; // first message in a run from the same sender
}

type MessageStatus = "sent" | "delivered" | "read";

function getMessageStatus(message: Message, currentUserId: string): MessageStatus {
  if (message.read_by.some((id) => id !== currentUserId)) return "read";
  if (message.read_by.length > 0) return "delivered";
  return "sent";
}

function StatusTicks({
  status,
}: {
  status: MessageStatus;
}) {
  if (status === "sent") {
    return <Check className="w-3.5 h-3.5 text-gray-400" aria-label="Sent" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="w-3.5 h-3.5 text-gray-400" aria-label="Delivered" />;
  }
  return <CheckCheck className="w-3.5 h-3.5 text-blue-500" aria-label="Read" />;
}

export function MessageBubble({
  message,
  currentUser,
  isGroup,
  showAvatar,
}: MessageBubbleProps) {
  const isOwn = message.sender_id === currentUser.id;
  const isDeleted = !!message.deleted_at;
  const status = isOwn ? getMessageStatus(message, currentUser.id) : null;

  return (
    <div
      className={cn(
        "flex items-end gap-1.5 px-3",
        isOwn ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar for received messages in group chats */}
      {!isOwn && isGroup && (
        <div className="w-8 shrink-0">
          {showAvatar && (
            <Avatar
              src={message.sender?.avatar_url}
              name={message.sender?.display_name ?? "User"}
              size={28}
            />
          )}
        </div>
      )}

      {/* Bubble */}
      <div
        className={cn(
          "relative max-w-[65%] min-w-[60px] px-3 pt-2 pb-2 rounded-2xl shadow-sm",
          isOwn
            ? "bg-[#dcf8c6] rounded-br-sm"
            : "bg-white rounded-bl-sm",
          isDeleted && "opacity-70"
        )}
      >
        {/* Sender name in groups */}
        {!isOwn && isGroup && showAvatar && (
          <p className="text-xs font-semibold text-[#075e54] mb-0.5 leading-none">
            {message.sender?.display_name ?? "Unknown"}
          </p>
        )}

        {/* Message content */}
        {isDeleted ? (
          <p className="text-sm text-gray-400 italic">This message was deleted</p>
        ) : (
          <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        )}

        {/* Footer: time + status ticks */}
        <div
          className={cn(
            "flex items-center gap-1 mt-0.5",
            isOwn ? "justify-end" : "justify-end"
          )}
        >
          <span className="text-[10px] text-gray-400 leading-none">
            {formatMessageTime(message.created_at)}
          </span>
          {isOwn && status && !isDeleted && (
            <StatusTicks status={status} />
          )}
        </div>
      </div>
    </div>
  );
}
