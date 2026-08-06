import { create } from "zustand";

export type CallMode = "voice" | "video";
export type CallStatus = "idle" | "incoming" | "outgoing" | "active";

export interface CallState {
  status: CallStatus;
  mode: CallMode;
  peerId: string | null;
  peerName: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Transient error message (call failure, no answer, …) shown in the overlay. */
  error: string | null;
  set: (patch: Partial<CallState>) => void;
}

export const useCallStore = create<CallState>((set) => ({
  status: "idle",
  mode: "voice",
  peerId: null,
  peerName: "",
  localStream: null,
  remoteStream: null,
  error: null,
  set: (patch) => set(patch),
}));
