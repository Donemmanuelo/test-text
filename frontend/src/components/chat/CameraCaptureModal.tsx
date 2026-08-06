"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Send, X } from "lucide-react";
import { media as mediaApi } from "@/lib/api";
import type { SendMessageRequest } from "@/lib/types";
import { Spinner } from "@/components/ui/Spinner";

interface CameraCaptureModalProps {
  roomId: string;
  onSend: (data: SendMessageRequest) => Promise<unknown>;
  onClose: () => void;
}

export function CameraCaptureModal({
  roomId,
  onSend,
  onClose,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null); // data URL preview
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [sending, setSending] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Start the camera on mount
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        if (!cancelled) {
          setCameraError(
            "Camera unavailable. Check that your browser has camera permission."
          );
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [stopStream]);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror preview → draw flipped so the photo matches what the user saw
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCaptured(canvas.toDataURL("image/jpeg", 0.92));
      },
      "image/jpeg",
      0.92
    );
  };

  const handleRetake = () => {
    setCaptured(null);
    setCapturedBlob(null);
  };

  const handleSend = async () => {
    if (!capturedBlob) return;
    setSending(true);
    try {
      const { upload_url, file_url } = await mediaApi.presign({
        filename: `camera-${Date.now()}.jpg`,
        content_type: "image/jpeg",
        room_id: roomId,
      });
      await mediaApi.uploadToS3(upload_url, new File([capturedBlob], "camera.jpg"));
      await onSend({ content: file_url, content_type: "image" });
      onClose();
    } catch (err: unknown) {
      console.error("Failed to send camera photo:", err);
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white shrink-0">
        <span className="text-sm font-medium">Take photo</span>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10"
          aria-label="Close camera"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Preview area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {cameraError ? (
          <div className="text-center px-6">
            <p className="text-sm text-gray-300">{cameraError}</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 text-sm font-medium rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              Close
            </button>
          </div>
        ) : captured ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={captured}
            alt="Captured photo"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            playsInline
            muted
            className="max-h-full max-w-full object-contain -scale-x-100"
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-8 py-6 shrink-0">
        {captured ? (
          <>
            <button
              onClick={handleRetake}
              disabled={sending}
              className="flex flex-col items-center gap-1.5 text-white disabled:opacity-50"
              aria-label="Retake"
            >
              <span className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25 transition-colors">
                <RotateCcw className="w-6 h-6" />
              </span>
              <span className="text-[11px] text-gray-300">Retake</span>
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="w-16 h-16 rounded-full bg-[#00a884] flex items-center justify-center hover:bg-[#02916f] transition-colors disabled:opacity-50"
              aria-label="Send photo"
            >
              {sending ? (
                <Spinner size="md" className="text-white" />
              ) : (
                <Send className="w-6 h-6 text-white" />
              )}
            </button>
          </>
        ) : (
          <button
            onClick={handleCapture}
            className="w-16 h-16 rounded-full bg-white flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Capture photo"
          >
            <Camera className="w-7 h-7 text-black" />
          </button>
        )}
      </div>
    </div>
  );
}
