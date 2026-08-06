/**
 * Tiny Web Audio helper for an incoming-message "pop" sound.
 * No audio assets required — synthesized on the fly.
 */
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = audioCtx ?? new Ctor();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

export function playMessageSound(): void {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046, ctx.currentTime); // C6
    osc.frequency.exponentialRampToValueAtTime(1318, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch {
    // audio is best-effort
  }
}

let ringTimer: ReturnType<typeof setInterval> | null = null;
let ringGain: GainNode | null = null;

/** Start a looping ringtone (used while a call is ringing). */
export function startRingtone(): void {
  stopRingtone();
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = 0.08;
    ringGain = gain;
    const output = gain; // local non-null ref for the closure

    const beep = () => {
      const now = ctx.currentTime;
      // Two-tone ring (like a phone)
      [0, 0.4].forEach((offset) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now + offset);
        osc.frequency.exponentialRampToValueAtTime(554, now + offset + 0.15);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now + offset);
        g.gain.exponentialRampToValueAtTime(0.5, now + offset + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.35);
        osc.connect(g);
        g.connect(output);
        osc.start(now + offset);
        osc.stop(now + offset + 0.4);
      });
    };
    beep();
    ringTimer = setInterval(beep, 1400);
  } catch {
    // audio is best-effort
  }
}

/** Stop the looping ringtone. */
export function stopRingtone(): void {
  if (ringTimer !== null) {
    clearInterval(ringTimer);
    ringTimer = null;
  }
  try {
    ringGain?.disconnect();
  } catch {
    // ignore
  }
  ringGain = null;
}

/** Ask for desktop notification permission (returns the new state). */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

/** Show a desktop notification if permission has been granted. */
export function showDesktopNotification(title: string, body: string): void {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }
  try {
    new Notification(title, { body, tag: "wa-new-message" });
  } catch {
    // some environments throw — ignore
  }
}
