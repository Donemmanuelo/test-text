"use client";

import { useState } from "react";
import {
  Check,
  CheckCheck,
  ChevronDown,
  FileText,
  Pencil,
  Reply,
  Trash2,
  X,
} from "lucide-react";
import { cn, formatMessageTime } from "@/lib/utils";
import type { Message, User } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";

interface MessageBubbleProps {
  message: Message;
  currentUser: User;
  isGroup: boolean;
  showAvatar: boolean;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message, content: string) => Promise<void>;
  onDelete?: (message: Message) => Promise<void>;
  isBusy?: boolean;
}

type MessageStatus = "sent" | "delivered" | "read";

function getMessageStatus(message: Message, currentUserId: string): MessageStatus {
  if (message.read_by.some((id) => id !== currentUserId)) return "read";
  if (message.read_by.length > 0) return "delivered";
  return "sent";
}

function StatusTicks({ status }: { status: MessageStatus }) {
  if (status === "sent") {
    return <Check className="w-3.5 h-3.5 text-gray-400" aria-label="Sent" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="w-3.5 h-3.5 text-gray-400" aria-label="Delivered" />;
  }
  return <CheckCheck className="w-3.5 h-3.5 text-blue-500" aria-label="Read" />;
}

function filenameFromUrl(url: string): string {
  try {
    const seg = url.split("/").pop() ?? "file";
    return decodeURIComponent(seg);
  } catch {
    return "file";
  }
}

/** Render message content based on its content_type. */
function MessageContent({
  message,
  deleted,
}: {
  message: Message;
  deleted: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const [vidError, setVidError] = useState(false);

  if (deleted) {
    return <p className="text-sm text-gray-400 italic">This message was deleted</p>;
  }

  switch (message.content_type) {
    case "image":
      if (imgError) {
        return (
          <div className="text-sm text-gray-600 underline truncate">
            <a href={message.content} target="_blank" rel="noreferrer">
              {filenameFromUrl(message.content)}
            </a>
          </div>
        );
      }
      return (
        <a
          href={message.content}
          target="_blank"
          rel="noreferrer"
          className="block rounded-lg overflow-hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={message.content}
            alt="Image message"
            className="max-h-72 w-full object-cover rounded-lg"
            onError={() => setImgError(true)}
          />
        </a>
      );
    case "audio":
      return (
        <audio controls preload="metadata" className="max-w-[240px] h-10">
          <source src={message.content} />
        </audio>
      );
    case "video":
      if (vidError) {
        return (
          <div className="text-sm text-gray-600 underline truncate">
            <a href={message.content} target="_blank" rel="noreferrer">
              {filenameFromUrl(message.content)}
            </a>
          </div>
        );
      }
      return (
        <video
          controls
          preload="metadata"
          className="max-h-72 w-full max-w-[320px] rounded-lg bg-black"
          onError={() => setVidError(true)}
        >
          <source src={message.content} />
        </video>
      );
    case "file":
      return (
        <a
          href={message.content}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-lg bg-white/50 border border-gray-200 px-3 py-2.5 hover:bg-white/80 transition-colors"
        >
          <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#075e54]/10 text-[#075e54]">
            <FileText className="w-5 h-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-800 truncate">
              {filenameFromUrl(message.content)}
            </span>
            <span className="block text-xs text-gray-400">Tap to open</span>
          </span>
        </a>
      );
    default:
      return (
        <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  currentUser,
  isGroup,
  showAvatar,
  onReply,
  onEdit,
  onDelete,
  isBusy = false,
}: MessageBubbleProps) {
  const isOwn = message.sender_id === currentUser.id;
  const isDeleted = !!message.deleted_at;
  const status = isOwn ? getMessageStatus(message, currentUser.id) : null;
  const canEdit =
    isOwn && message.content_type === "text" && !isDeleted && !!onEdit;
  const canDelete = isOwn && !isDeleted && !!onDelete;

  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const closeMenu = () => {
    setMenuOpen(false);
    setConfirmingDelete(false);
  };

  const handleStartEdit = () => {
    setDraft(message.content);
    setEditing(true);
    closeMenu();
  };

  const handleSaveEdit = async () => {
    const content = draft.trim();
    if (!content || !onEdit) return;
    setActionBusy(true);
    try {
      await onEdit(message, content);
      setEditing(false);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setActionBusy(true);
    try {
      await onDelete(message);
      setMenuOpen(false);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "group relative flex items-end gap-1.5 px-3",
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
          "relative max-w-[65%] min-w-[60px] px-3 pt-1.5 pb-1.5 rounded-2xl shadow-sm transition-colors",
          isOwn ? "bg-[#dcf8c6] rounded-br-sm" : "bg-white rounded-bl-sm",
          isDeleted && "opacity-70"
        )}
      >
        {/* Sender name in groups */}
        {!isOwn && isGroup && showAvatar && (
          <p className="text-xs font-semibold text-[#075e54] mb-0.5 leading-none">
            {message.sender?.display_name ?? "Unknown"}
          </p>
        )}

        {/* Reply preview */}
        {message.reply_to && (
          <div className="flex flex-col border-l-[3px] border-[#075e54]/40 pl-2.5 pr-1 py-1 my-1 rounded-sm bg-black/[0.03]">
            <span className="text-xs font-semibold text-[#075e54]">
              {message.reply_to.sender_name}
            </span>
            <span className="text-xs text-gray-500 truncate max-w-[200px]">
              {message.reply_to.content}
            </span>
          </div>
        )}

        {/* Editing UI */}
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
              className="w-full resize-none rounded-lg border border-[#075e54]/40 px-2 py-1.5 text-sm outline-none focus:border-[#075e54] bg-white"
            />
            <div className="flex justify-end gap-1.5">
              <button
                onClick={() => setEditing(false)}
                disabled={actionBusy}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={actionBusy || !draft.trim()}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[#075e54] hover:bg-[#064d44] text-white transition-colors disabled:opacity-50"
              >
                {actionBusy ? <Spinner size="sm" className="text-white" /> : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <MessageContent message={message} deleted={isDeleted} />
        )}

        {/* Footer: time + edited + status ticks */}
        {!editing && (
          <div
            className={cn(
              "flex items-center gap-1 mt-0.5",
              isOwn ? "justify-end" : "justify-end"
            )}
          >
            {message.edited_at && !isDeleted && (
              <span className="text-[10px] text-gray-400 leading-none">edited</span>
            )}
            <span className="text-[10px] text-gray-400 leading-none">
              {formatMessageTime(message.created_at)}
            </span>
            {isOwn && status && !isDeleted && <StatusTicks status={status} />}
          </div>
        )}
      </div>

      {/* Action menu (revealed on hover) */}
      {!isDeleted && (canEdit || canDelete || onReply) && (
        <div
          className={cn(
            "absolute top-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity",
            isOwn ? "left-0" : "right-0"
          )}
        >
          <button
            onClick={() => {
              setMenuOpen((v) => !v);
              setConfirmingDelete(false);
            }}
            className="p-1 rounded-full hover:bg-black/10 text-gray-500"
            aria-label="Message actions"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          {menuOpen && (
            <>
              {/* Click-away backdrop to close the menu */}
              <div
                className="fixed inset-0 z-10 cursor-default"
                onClick={closeMenu}
              />
              <div className="absolute top-6 z-20 min-w-[140px] rounded-xl bg-white shadow-lg border border-gray-100 py-1">
              {onReply && (
                <button
                  onClick={() => {
                    onReply(message);
                    closeMenu();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Reply className="w-3.5 h-3.5" />
                  Reply
                </button>
              )}
              {canEdit && (
                <button
                  onClick={handleStartEdit}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => {
                    if (!confirmingDelete) {
                      setConfirmingDelete(true);
                      return;
                    }
                    handleDelete();
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50",
                    confirmingDelete ? "text-red-600 font-medium" : "text-red-500"
                  )}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {confirmingDelete ? "Confirm delete?" : "Delete"}
                  {isBusy && <Spinner size="sm" />}
                </button>
              )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Close button while editing */}
      {editing && (
        <button
          onClick={() => setEditing(false)}
          className="p-1 text-gray-400 hover:text-gray-600"
          aria-label="Cancel editing"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
