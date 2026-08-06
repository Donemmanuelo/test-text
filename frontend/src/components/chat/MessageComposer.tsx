"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Send, Paperclip, Camera, X, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWsManager } from "@/lib/ws";
import { media as mediaApi } from "@/lib/api";
import type { Message, SendMessageRequest } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";
import { useSettingsStore } from "@/store/settingsStore";
import { CameraCaptureModal } from "./CameraCaptureModal";

const TYPING_DEBOUNCE_MS = 2_000;
const MAX_ROWS = 5;

interface MessageComposerProps {
  roomId: string;
  onSend: (data: SendMessageRequest) => Promise<unknown>;
  isSending: boolean;
  replyTarget?: Message | null;
  onCancelReply?: () => void;
}

export function MessageComposer({
  roomId,
  onSend,
  isSending,
  replyTarget = null,
  onCancelReply,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const enterToSend = useSettingsStore((s) => s.enterToSend);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 24; // px
    const maxHeight = lineHeight * MAX_ROWS + 16; // padding
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [text]);

  const sendTypingStart = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      getWsManager()?.sendTypingStart(roomId);
    }
  }, [roomId]);

  const sendTypingStop = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      getWsManager()?.sendTypingStop(roomId);
    }
  }, [roomId]);

  const resetTypingTimer = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendTypingStop();
    }, TYPING_DEBOUNCE_MS);
  }, [sendTypingStop]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    sendTypingStart();
    resetTypingTimer();
  };

const handleSubmit = useCallback(async () => {
    const content = text.trim();
    if (!content || isSending) return;
    sendTypingStop();
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setText("");
    await onSend({
      content,
      content_type: "text",
      reply_to_id: replyTarget?.id ?? undefined,
    });
    onCancelReply?.();
    textareaRef.current?.focus();
  }, [text, isSending, onSend, sendTypingStop, replyTarget, onCancelReply]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    // Enter sends by default; when "Enter to send" is off, use Ctrl/Cmd+Enter.
    const sendKey = enterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey;
    if (sendKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setIsUploading(true);

    try {
      const { upload_url, file_url } = await mediaApi.presign({
        filename: file.name,
        content_type: file.type,
        room_id: roomId,
      });
      await mediaApi.uploadToS3(upload_url, file);
      const contentType = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
        ? "audio"
        : "file";
      await onSend({ content: file_url, content_type: contentType });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadError(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const canSend = text.trim().length > 0 && !isSending;

  return (
    <div className="px-3 py-2 border-t border-gray-200 bg-white">
      {/* Reply bar */}
      {replyTarget && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-[#075e54]/[0.06] border border-[#075e54]/15">
          <Reply className="w-4 h-4 text-[#075e54] shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#075e54]">
              Replying to {replyTarget.sender?.display_name ?? "message"}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {replyTarget.content_type === "text"
                ? replyTarget.content
                : replyTarget.content_type === "image"
                ? "📷 Photo"
                : replyTarget.content_type === "audio"
                ? "🎵 Audio"
                : replyTarget.content_type === "video"
                ? "🎬 Video"
                : "📎 File"}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 text-gray-400 hover:text-gray-600"
            aria-label="Cancel reply"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-red-50 text-xs text-red-600">
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Camera button */}
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          disabled={isUploading}
          className="shrink-0 p-2 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          aria-label="Take photo"
        >
          <Camera className="w-5 h-5" />
        </button>

        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="shrink-0 p-2 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          aria-label="Attach file"
        >
          {isUploading ? <Spinner size="sm" /> : <Paperclip className="w-5 h-5" />}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,application/*"
          onChange={handleFileSelect}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-2.5 text-sm
            outline-none focus:border-[#075e54] transition-colors bg-gray-50
            placeholder:text-gray-400 leading-6 overflow-y-auto"
          style={{ maxHeight: `${24 * MAX_ROWS + 16}px` }}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          className={cn(
            "shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-colors",
            canSend
              ? "bg-[#075e54] text-white hover:bg-[#064d44]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          )}
          aria-label="Send message"
        >
          {isSending ? (
            <Spinner size="sm" className="text-white" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Camera capture modal */}
      {cameraOpen && (
        <CameraCaptureModal
          roomId={roomId}
          onSend={onSend}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}
