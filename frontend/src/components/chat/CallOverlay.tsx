"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneIncoming, PhoneOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useCallStore } from "@/store/callStore";
import { startRingtone, stopRingtone } from "@/lib/sounds";
import { acceptCall, declineCall, hangup, toggleMuteMic } from "@/lib/rtc";
import { cn } from "@/lib/utils";

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** <video> wrapper that attaches a MediaStream via srcObject (ref-based). */
function VideoStream({
  stream,
  className,
  muted = false,
}: {
  stream: MediaStream;
  className?: string;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={className}
    />
  );
}

export function CallOverlay() {
  const status = useCallStore((s) => s.status);
  const mode = useCallStore((s) => s.mode);
  const peerName = useCallStore((s) => s.peerName);
  const localStream = useCallStore((s) => s.localStream);
  const remoteStream = useCallStore((s) => s.remoteStream);
  const error = useCallStore((s) => s.error);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  // Ringtone while ringing (incoming/outgoing)
  useEffect(() => {
    if (status === "incoming" || status === "outgoing") {
      startRingtone();
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [status]);

  // Call duration timer while active
  useEffect(() => {
    if (status !== "active") {
      startRef.current = null;
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const id = setInterval(() => {
      if (startRef.current) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  // Reset mute state whenever a call starts/ends
  useEffect(() => {
    if (status === "idle") setMuted(false);
  }, [status]);

  // Error card (call failed / no answer / missed call) — dismissible
  if (error) {
    return (
      <div className="fixed inset-0 z-[60] bg-[#0b141a]/[0.98] flex items-center justify-center">
        <div className="bg-white rounded-2xl w-[min(92vw,360px)] p-6 text-center shadow-2xl">
          <p className="text-lg font-semibold text-gray-900">Call ended</p>
          <p className="text-sm text-gray-500 mt-1.5">{error}</p>
          <button
            onClick={() => useCallStore.getState().set({ error: null })}
            className="mt-5 px-6 py-2.5 rounded-full bg-[#00a884] hover:bg-[#02916f] text-white text-sm font-medium transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  if (status === "idle") return null;

  const isVideoCall = mode === "video" && status === "active";

  return (
    <div className="fixed inset-0 z-[60] bg-[#0b141a]/[0.98] flex flex-col items-center justify-center select-none">
      {/* ── Active video call: full remote video ─────────────────────────── */}
      {isVideoCall && remoteStream ? (
        <>
          <VideoStream
            stream={remoteStream}
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Local preview (PiP) */}
          {localStream && (
            <VideoStream
              stream={localStream}
              muted
              className="absolute bottom-24 right-4 w-32 h-48 md:w-40 md:h-60 rounded-xl object-cover border-2 border-white/20 shadow-2xl -scale-x-100 z-10"
            />
          )}
          {/* Top bar */}
          <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/60 to-transparent z-10">
            <p className="text-white font-semibold text-lg truncate">{peerName}</p>
            <p className="text-white/70 text-sm">{formatDuration(elapsed)}</p>
          </div>
        </>
      ) : (
        /* ── Voice / ringing UI ─────────────────────────────────────────── */
        <div className="flex flex-col items-center px-8 text-center">
          <Avatar
            src={null}
            name={peerName || "…"}
            size={110}
            className={cn(
              "ring-4 ring-white/10",
              (status === "incoming" || status === "outgoing") && "animate-pulse"
            )}
          />
          <h2 className="mt-6 text-2xl font-semibold text-white truncate max-w-full">
            {peerName || "…"}
          </h2>
          <p className="mt-1 text-white/60 text-sm">
            {status === "incoming" &&
              (mode === "video" ? "Incoming video call…" : "Incoming voice call…")}
            {status === "outgoing" && "Calling…"}
            {status === "active" && (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-[#00a884]" />
                {formatDuration(elapsed)}
              </span>
            )}
          </p>
        </div>
      )}

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="absolute bottom-10 inset-x-0 flex items-center justify-center gap-6 z-10">
        {status === "incoming" && (
          <>
            <button
              onClick={declineCall}
              className="flex flex-col items-center gap-1.5 text-white"
              aria-label="Decline call"
            >
              <span className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors">
                <PhoneOff className="w-7 h-7" />
              </span>
              <span className="text-xs text-white/70">Decline</span>
            </button>
            <button
              onClick={() => void acceptCall()}
              className="flex flex-col items-center gap-1.5 text-white"
              aria-label="Accept call"
            >
              <span className="w-16 h-16 rounded-full bg-[#00a884] flex items-center justify-center hover:bg-[#02916f] transition-colors">
                <PhoneIncoming className="w-7 h-7" />
              </span>
              <span className="text-xs text-white/70">Accept</span>
            </button>
          </>
        )}

        {(status === "outgoing" || status === "active") && (
          <>
            {status === "active" && (
              <button
                onClick={() => setMuted(toggleMuteMic())}
                className="flex flex-col items-center gap-1.5 text-white"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                <span
                  className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
                    muted ? "bg-white/25" : "bg-white/10 hover:bg-white/20"
                  )}
                >
                  {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </span>
                <span className="text-xs text-white/70">{muted ? "Unmute" : "Mute"}</span>
              </button>
            )}
            <button
              onClick={hangup}
              className="flex flex-col items-center gap-1.5 text-white"
              aria-label="End call"
            >
              <span className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors">
                <PhoneOff className="w-7 h-7" />
              </span>
              <span className="text-xs text-white/70">End</span>
            </button>
          </>
        )}
      </div>

    </div>
  );
}
