import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { useSettingsStore } from "@/store/settingsStore";
import { getWsManager, initWsManager } from "@/lib/ws";
import { playMessageSound, showDesktopNotification } from "@/lib/sounds";
import { handleCallEvent } from "@/lib/rtc";
import type { WsEvent } from "@/lib/types";

function previewText(payload: Extract<WsEvent, { type: "message.new" }>["payload"]): string {
  switch (payload.content_type) {
    case "image":
      return "📷 Photo";
    case "audio":
      return "🎵 Audio";
    case "video":
      return "🎬 Video";
    case "file":
      return "📎 File";
    default:
      return payload.content.length > 120
        ? payload.content.slice(0, 120) + "…"
        : payload.content;
  }
}

/**
 * Mount this hook once at the app level (e.g. in the chat layout).
 * It wires up WebSocket event handlers to Zustand store mutations.
 */
export function useWebSocket() {
  const { accessToken } = useAuthStore();
  const activeRoomId = useChatStore((s) => s.activeRoomId);
  // Select stable action references (never the whole store) so the effect
  // below doesn't re-register handlers on every store update.
  const appendMessage = useChatStore((s) => s.appendMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const markMessageRead = useChatStore((s) => s.markMessageRead);
  const setPresence = useChatStore((s) => s.setPresence);
  const setTyping = useChatStore((s) => s.setTyping);
  const incrementUnread = useChatStore((s) => s.incrementUnread);
  const initialised = useRef(false);

  useEffect(() => {
    if (!accessToken) return;

    // Initialise WS if not already running
    if (!initialised.current || !getWsManager()) {
      initWsManager(accessToken);
      initialised.current = true;
    }

    const ws = getWsManager();
    if (!ws) return;

    // ── message.new ──────────────────────────────────────────────────────────
    const onMessageNew = (payload: Extract<WsEvent, { type: "message.new" }>["payload"]) => {
      appendMessage(payload);
      const isActive = payload.room_id === activeRoomId;
      if (isActive) return;

      const settings = useSettingsStore.getState();
      if (settings.mutedRooms.includes(payload.room_id)) return;

      incrementUnread(payload.room_id);
      if (settings.playSounds) playMessageSound();
      if (settings.desktopNotifications) {
        showDesktopNotification(
          payload.sender?.display_name ?? "New message",
          previewText(payload)
        );
      }
    };

    // ── message.edited ───────────────────────────────────────────────────────
    const onMessageEdited = (payload: Extract<WsEvent, { type: "message.edited" }>["payload"]) => {
      updateMessage(payload);
    };

    // ── message.deleted ──────────────────────────────────────────────────────
    const onMessageDeleted = (payload: Extract<WsEvent, { type: "message.deleted" }>["payload"]) => {
      deleteMessage(payload.id, payload.room_id);
    };

    // ── message.status ───────────────────────────────────────────────────────
    const onMessageStatus = (payload: Extract<WsEvent, { type: "message.status" }>["payload"]) => {
      if (payload.status === "read") {
        markMessageRead(payload.message_id, payload.user_id);
      }
    };

    // ── presence.update ──────────────────────────────────────────────────────
    const onPresence = (payload: Extract<WsEvent, { type: "presence.update" }>["payload"]) => {
      setPresence(payload.user_id, payload.online, payload.last_seen);
    };

    // ── typing.start ─────────────────────────────────────────────────────────
    const onTypingStart = (payload: Extract<WsEvent, { type: "typing.start" }>["payload"]) => {
      setTyping(payload.room_id, payload.user_id, true);
    };

    // ── typing.stop ──────────────────────────────────────────────────────────
    const onTypingStop = (payload: Extract<WsEvent, { type: "typing.stop" }>["payload"]) => {
      setTyping(payload.room_id, payload.user_id, false);
    };

    // ── call signaling ───────────────────────────────────────────────────────
    // (WebRTC offer/answer/ICE/hangup — routed to the RTC session manager)
    const onCallOffer = (payload: Extract<WsEvent, { type: "call.offer" }>["payload"]) => {
      void handleCallEvent({ type: "call.offer", payload });
    };
    const onCallAnswer = (payload: Extract<WsEvent, { type: "call.answer" }>["payload"]) => {
      void handleCallEvent({ type: "call.answer", payload });
    };
    const onCallIce = (payload: Extract<WsEvent, { type: "call.ice" }>["payload"]) => {
      void handleCallEvent({ type: "call.ice", payload });
    };
    const onCallEnd = (payload: Extract<WsEvent, { type: "call.end" }>["payload"]) => {
      void handleCallEvent({ type: "call.end", payload });
    };
    const onCallDecline = (payload: Extract<WsEvent, { type: "call.decline" }>["payload"]) => {
      void handleCallEvent({ type: "call.decline", payload });
    };

    ws.on("message.new", onMessageNew);
    ws.on("message.edited", onMessageEdited);
    ws.on("message.deleted", onMessageDeleted);
    ws.on("message.status", onMessageStatus);
    ws.on("presence.update", onPresence);
    ws.on("typing.start", onTypingStart);
    ws.on("typing.stop", onTypingStop);
    ws.on("call.offer", onCallOffer);
    ws.on("call.answer", onCallAnswer);
    ws.on("call.ice", onCallIce);
    ws.on("call.end", onCallEnd);
    ws.on("call.decline", onCallDecline);

    return () => {
      ws.off("message.new", onMessageNew);
      ws.off("message.edited", onMessageEdited);
      ws.off("message.deleted", onMessageDeleted);
      ws.off("message.status", onMessageStatus);
      ws.off("presence.update", onPresence);
      ws.off("typing.start", onTypingStart);
      ws.off("typing.stop", onTypingStop);
      ws.off("call.offer", onCallOffer);
      ws.off("call.answer", onCallAnswer);
      ws.off("call.ice", onCallIce);
      ws.off("call.end", onCallEnd);
      ws.off("call.decline", onCallDecline);
    };
  }, [
    accessToken,
    activeRoomId,
    appendMessage,
    updateMessage,
    deleteMessage,
    markMessageRead,
    setPresence,
    setTyping,
    incrementUnread,
  ]);
}
