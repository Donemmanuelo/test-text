import { useCallStore, type CallMode } from "@/store/callStore";
import { getWsManager } from "@/lib/ws";
import { users as usersApi } from "@/lib/api";
import type { WsClientEvent, WsEvent } from "@/lib/types";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const RING_TIMEOUT_MS = 30_000; // outgoing: auto-cancel after this long ringing
const INCOMING_TIMEOUT_MS = 45_000; // incoming: auto-decline after this long
const WATCHDOG_INTERVAL_MS = 5_000;
const WATCHDOG_BAD_POLLS = 2;

const FAILED_STATES = ["disconnected", "failed", "closed"] as const;

let pc: RTCPeerConnection | null = null;
let peerIdRef: string | null = null;
let pendingOfferRef: string | null = null;
let pendingIceRef: RTCIceCandidateInit[] = [];
let ringTimer: ReturnType<typeof setTimeout> | null = null;
let watchdog: ReturnType<typeof setInterval> | null = null;
let watchdogBadPolls = 0;

type CallSignal =
  | {
      type: "call.offer";
      payload: { target_user_id: string; sdp: string; mode: CallMode };
    }
  | { type: "call.answer"; payload: { target_user_id: string; sdp: string } }
  | { type: "call.ice"; payload: { target_user_id: string; candidate: string } }
  | { type: "call.end"; payload: { target_user_id: string } }
  | { type: "call.decline"; payload: { target_user_id: string } };

function sendSignal<K extends CallSignal["type"]>(
  type: K,
  payload: Extract<CallSignal, { type: K }>["payload"]
): void {
  getWsManager()?.emit({ type, payload } as WsClientEvent);
}

function setCallError(error: string) {
  useCallStore.getState().set({ error });
}

function clearCallError() {
  useCallStore.getState().set({ error: null });
}

function stopTimers() {
  if (ringTimer !== null) {
    clearTimeout(ringTimer);
    ringTimer = null;
  }
  if (watchdog !== null) {
    clearInterval(watchdog);
    watchdog = null;
  }
  watchdogBadPolls = 0;
}

async function getMedia(mode: CallMode): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video:
      mode === "video"
        ? { width: { ideal: 1280 }, height: { ideal: 720 } }
        : false,
  });
  useCallStore.getState().set({ localStream: stream });
  return stream;
}

function startWatchdog() {
  stopTimers(); // clears ring timer as well
  // Guard against races where the call ended while we were awaiting media.
  if (useCallStore.getState().status !== "active") return;
  watchdogBadPolls = 0;
  watchdog = setInterval(() => {
    const status = useCallStore.getState().status;
    if (status !== "active") {
      stopTimers(); // call ended — self-clean the interval
      return;
    }
    const conn = pc?.connectionState ?? "closed";
    if ((FAILED_STATES as readonly string[]).includes(conn)) {
      watchdogBadPolls += 1;
      if (watchdogBadPolls >= WATCHDOG_BAD_POLLS) {
        cleanup(true); // peer hung up / vanished — end the call locally
      }
    } else {
      watchdogBadPolls = 0;
    }
  }, WATCHDOG_INTERVAL_MS);
}

function createPeer(stream: MediaStream) {
  pc = new RTCPeerConnection(RTC_CONFIG);
  stream.getTracks().forEach((t) => pc!.addTrack(t, stream));

  const remote = new MediaStream();
  useCallStore.getState().set({ remoteStream: remote });

  pc.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
    useCallStore.getState().set({ remoteStream: remote });
  };

  pc.onicecandidate = (event) => {
    if (event.candidate && peerIdRef) {
      sendSignal("call.ice", {
        target_user_id: peerIdRef,
        candidate: JSON.stringify(event.candidate.toJSON()),
      });
    }
  };

  const peerGone = () => {
    const status = useCallStore.getState().status;
    if (status === "idle") return;
    const conn = pc?.connectionState ?? "";
    // Hard failures end the call immediately; transient "disconnected" is
    // handled by the watchdog (which tolerates a couple of bad polls).
    if (conn === "failed" || conn === "closed") {
      cleanup(true);
    }
  };

  pc.onconnectionstatechange = peerGone;
  pc.oniceconnectionstatechange = peerGone;
}

function cleanup(notifyPeer: boolean) {
  const state = useCallStore.getState();
  if (notifyPeer && peerIdRef && state.status !== "idle") {
    sendSignal("call.end", { target_user_id: peerIdRef });
  }
  pc?.close();
  pc = null;
  state.localStream?.getTracks().forEach((t) => t.stop());
  peerIdRef = null;
  pendingOfferRef = null;
  pendingIceRef = [];
  stopTimers();
  useCallStore.getState().set({
    status: "idle",
    mode: "voice",
    peerId: null,
    peerName: "",
    localStream: null,
    remoteStream: null,
  });
}

/** Start an outgoing call to a peer. */
export async function startCall(
  peerId: string,
  peerName: string,
  mode: CallMode
) {
  const state = useCallStore.getState();
  if (state.status !== "idle") return;
  clearCallError();
  peerIdRef = peerId;
  useCallStore.getState().set({
    status: "outgoing",
    mode,
    peerId,
    peerName,
  });

  // Auto-cancel if the callee never answers
  ringTimer = setTimeout(() => {
    if (useCallStore.getState().status === "outgoing") {
      cleanup(true);
      setCallError("No answer. Try again later.");
    }
  }, RING_TIMEOUT_MS);

  try {
    const stream = await getMedia(mode);
    // User may have cancelled while the permission prompt was up.
    if (useCallStore.getState().status !== "outgoing" || !peerIdRef) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    createPeer(stream);
    const offer = await pc!.createOffer();
    await pc!.setLocalDescription(offer);
    sendSignal("call.offer", {
      target_user_id: peerId,
      sdp: JSON.stringify(offer),
      mode,
    });
  } catch (err) {
    console.error("Failed to start call:", err);
    cleanup(false);
    setCallError(
      mode === "video"
        ? "Couldn't start the video call. Camera or microphone unavailable — check permissions."
        : "Couldn't start the call. Microphone unavailable — check permissions."
    );
  }
}

/** Accept the currently ringing incoming call. */
export async function acceptCall() {
  const state = useCallStore.getState();
  if (state.status !== "incoming" || !pendingOfferRef) return;
  clearCallError();
  useCallStore.getState().set({ status: "active" });
  try {
    const stream = await getMedia(state.mode);
    // User may have hung up while the permission prompt was up.
    if (useCallStore.getState().status !== "active" || !peerIdRef) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    createPeer(stream);
    await pc!.setRemoteDescription(JSON.parse(pendingOfferRef));
    const answer = await pc!.createAnswer();
    await pc!.setLocalDescription(answer);
    if (peerIdRef) {
      sendSignal("call.answer", {
        target_user_id: peerIdRef,
        sdp: JSON.stringify(answer),
      });
    }
    // Flush any ICE candidates that arrived while ringing
    for (const cand of pendingIceRef) {
      try {
        await pc!.addIceCandidate(cand);
      } catch {
        // ignore
      }
    }
    pendingIceRef = [];
    startWatchdog();
  } catch (err) {
    console.error("Failed to accept call:", err);
    cleanup(true);
    setCallError(
      state.mode === "video"
        ? "Couldn't connect the video call. Camera or microphone unavailable — check permissions."
        : "Couldn't connect the call. Microphone unavailable — check permissions."
    );
  }
}

/** Decline the currently ringing incoming call. */
export function declineCall() {
  const state = useCallStore.getState();
  if (state.status === "incoming" && peerIdRef) {
    sendSignal("call.decline", { target_user_id: peerIdRef });
  }
  cleanup(false);
}

/** Hang up an active or outgoing call. */
export function hangup() {
  cleanup(true);
}

/** Toggle the local microphone. Returns the new enabled state. */
export function toggleMuteMic(): boolean {
  const stream = useCallStore.getState().localStream;
  const audio = stream?.getAudioTracks()[0];
  if (!audio) return false;
  audio.enabled = !audio.enabled;
  return audio.enabled;
}

/** Handle an inbound call signaling event from the WebSocket. */
export async function handleCallEvent(event: WsEvent) {
  switch (event.type) {
    case "call.offer": {
      const state = useCallStore.getState();
      if (state.status !== "idle") {
        // Busy — decline automatically
        getWsManager()?.emit({
          type: "call.decline",
          payload: { target_user_id: event.payload.caller_id },
        });
        return;
      }
      clearCallError();
      peerIdRef = event.payload.caller_id;
      pendingOfferRef = event.payload.sdp;
      const mode: CallMode = event.payload.mode;
      useCallStore.getState().set({
        status: "incoming",
        mode,
        peerId: event.payload.caller_id,
        peerName: "Unknown",
      });

      // Auto-decline if the caller never connects / the app is left ringing
      ringTimer = setTimeout(() => {
        if (useCallStore.getState().status === "incoming") {
          sendSignal("call.decline", {
            target_user_id: peerIdRef ?? "",
          });
          cleanup(false);
          setCallError("Missed call");
        }
      }, INCOMING_TIMEOUT_MS);

      // Fetch the caller's display name for the incoming screen
      usersApi
        .get(event.payload.caller_id)
        .then((u) => {
          const cur = useCallStore.getState();
          if (cur.peerId === event.payload.caller_id) {
            cur.set({ peerName: u.display_name });
          }
        })
        .catch(() => {});
      break;
    }
    case "call.answer": {
      const state = useCallStore.getState();
      if (state.status !== "outgoing") return;
      try {
        await pc?.setRemoteDescription(JSON.parse(event.payload.sdp));
        for (const cand of pendingIceRef) {
          try {
            await pc?.addIceCandidate(cand);
          } catch {
            // ignore
          }
        }
        pendingIceRef = [];
        useCallStore.getState().set({ status: "active" });
        startWatchdog();
      } catch (err) {
        console.error("Failed to handle answer:", err);
        cleanup(true);
      }
      break;
    }
    case "call.ice": {
      if (!event.payload.candidate) break;
      try {
        const candidate = JSON.parse(event.payload.candidate);
        if (useCallStore.getState().status === "active" && pc) {
          await pc.addIceCandidate(candidate);
        } else {
          pendingIceRef.push(candidate);
        }
      } catch {
        // ignore malformed candidates
      }
      break;
    }
    case "call.end":
    case "call.decline": {
      cleanup(false);
      break;
    }
    default:
      break;
  }
}
