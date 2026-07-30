import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { getWsManager, initWsManager } from "@/lib/ws";
import type { WsEvent } from "@/lib/types";

/**
 * Mount this hook once at the app level (e.g. in the chat layout).
 * It wires up WebSocket event handlers to Zustand store mutations.
 */
export function useWebSocket() {
  const { accessToken } = useAuthStore();
  const store = useChatStore();
  const activeRoomId = useChatStore((s) => s.activeRoomId);
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
      store.appendMessage(payload);
      if (payload.room_id !== activeRoomId) {
        store.incrementUnread(payload.room_id);
      }
    };

    // ── message.edited ───────────────────────────────────────────────────────
    const onMessageEdited = (payload: Extract<WsEvent, { type: "message.edited" }>["payload"]) => {
      store.updateMessage(payload);
    };

    // ── message.deleted ──────────────────────────────────────────────────────
    const onMessageDeleted = (payload: Extract<WsEvent, { type: "message.deleted" }>["payload"]) => {
      store.deleteMessage(payload.id, payload.room_id);
    };

    // ── message.status ───────────────────────────────────────────────────────
    const onMessageStatus = (payload: Extract<WsEvent, { type: "message.status" }>["payload"]) => {
      if (payload.status === "read") {
        store.markMessageRead(payload.message_id, payload.user_id);
      }
    };

    // ── presence.update ──────────────────────────────────────────────────────
    const onPresence = (payload: Extract<WsEvent, { type: "presence.update" }>["payload"]) => {
      store.setPresence(payload.user_id, payload.online, payload.last_seen);
    };

    // ── typing.start ─────────────────────────────────────────────────────────
    const onTypingStart = (payload: Extract<WsEvent, { type: "typing.start" }>["payload"]) => {
      store.setTyping(payload.room_id, payload.user_id, true);
    };

    // ── typing.stop ──────────────────────────────────────────────────────────
    const onTypingStop = (payload: Extract<WsEvent, { type: "typing.stop" }>["payload"]) => {
      store.setTyping(payload.room_id, payload.user_id, false);
    };

    ws.on("message.new", onMessageNew);
    ws.on("message.edited", onMessageEdited);
    ws.on("message.deleted", onMessageDeleted);
    ws.on("message.status", onMessageStatus);
    ws.on("presence.update", onPresence);
    ws.on("typing.start", onTypingStart);
    ws.on("typing.stop", onTypingStop);

    return () => {
      ws.off("message.new", onMessageNew);
      ws.off("message.edited", onMessageEdited);
      ws.off("message.deleted", onMessageDeleted);
      ws.off("message.status", onMessageStatus);
      ws.off("presence.update", onPresence);
      ws.off("typing.start", onTypingStart);
      ws.off("typing.stop", onTypingStop);
    };
  }, [accessToken, activeRoomId, store]);
}
