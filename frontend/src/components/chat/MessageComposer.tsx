"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Send, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWsManager } from "@/lib/ws";
import { media as mediaApi } from "@/lib/api";
import type { SendMessageRequest } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";

const TYPING_DEBOUNCE_MS = 2_000;
const MAX_ROWS = 5;

interface MessageComposerProps {
  roomId: string;
  onSend: (data: SendMessageRequest) => Promise<void>;
  isSending: boolean;
}

export function MessageComposer({
  roomId,
  onSend,
  isSending,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
    await onSend({ content, content_type: "text" });
    textareaRef.current?.focus();
  }, [text, isSending, onSend, sendTypingStop]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
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
      const contentType = file.type.startsWith("image/") ? "image" : "file";
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
      {uploadError && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-red-50 text-xs text-red-600">
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
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
          accept="image/*,application/*,audio/*"
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
    </div>
  );
}
