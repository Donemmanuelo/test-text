import type { WsEvent, WsClientEvent } from "./types";

type WsEventType = WsEvent["type"];
type WsEventPayload<T extends WsEventType> = Extract<WsEvent, { type: T }>["payload"];

type WsEventHandler<T extends WsEventType> = (
  payload: WsEventPayload<T>
) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (payload: any) => void;

const HEARTBEAT_INTERVAL_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * Singleton WebSocket manager with auto-reconnect, exponential backoff,
 * heartbeat pings, and an EventEmitter-style API.
 */
export class WsManager {
  private ws: WebSocket | null = null;
  private token: string;
  private backendUrl: string;
  private handlers: Map<string, Set<AnyHandler>> = new Map();
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private manualClose = false;

  constructor(token: string, backendUrl: string) {
    this.token = token;
    this.backendUrl = backendUrl;
  }

  /** Connect (or reconnect) the WebSocket. */
  connect(): void {
    if (this.destroyed) return;
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.manualClose = false;
    const url = `${this.backendUrl}/api/ws?token=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.startHeartbeat();
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      if (!this.manualClose && !this.destroyed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror; let it handle reconnect
    };

    this.ws.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as WsEvent;
        const handlerSet = this.handlers.get(data.type);
        if (handlerSet) {
          handlerSet.forEach((h) => h(data.payload));
        }
      } catch {
        // malformed message — ignore
      }
    };
  }

  /** Register an event handler for a specific WS event type. */
  on<T extends WsEventType>(type: T, handler: WsEventHandler<T>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as AnyHandler);
  }

  /** Unregister an event handler. */
  off<T extends WsEventType>(type: T, handler: WsEventHandler<T>): void {
    this.handlers.get(type)?.delete(handler as AnyHandler);
  }

  /** Send a raw client event to the server. */
  emit(event: WsClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  /** Convenience: send typing.start for a room. */
  sendTypingStart(roomId: string): void {
    this.emit({ type: "typing.start", payload: { room_id: roomId } });
  }

  /** Convenience: send typing.stop for a room. */
  sendTypingStop(roomId: string): void {
    this.emit({ type: "typing.stop", payload: { room_id: roomId } });
  }

  /** Update the auth token (e.g. after token refresh). */
  updateToken(token: string): void {
    this.token = token;
    // Reconnect with new token
    this.disconnect();
    this.connect();
  }

  /** Gracefully close the connection without reconnecting. */
  disconnect(): void {
    this.manualClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  /** Permanently destroy this manager (no further reconnects). */
  destroy(): void {
    this.destroyed = true;
    this.disconnect();
    this.handlers.clear();
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.emit({ type: "presence.ping" });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        MAX_RECONNECT_DELAY_MS
      );
      this.connect();
    }, this.reconnectDelay);
  }
}

// Module-level singleton — replaced when user logs in/out
let _wsManager: WsManager | null = null;

export function getWsManager(): WsManager | null {
  return _wsManager;
}

export function initWsManager(token: string): WsManager {
  if (_wsManager) {
    _wsManager.destroy();
  }
  const backendUrl =
    process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";
  _wsManager = new WsManager(token, backendUrl);
  _wsManager.connect();
  return _wsManager;
}

export function destroyWsManager(): void {
  if (_wsManager) {
    _wsManager.destroy();
    _wsManager = null;
  }
}
