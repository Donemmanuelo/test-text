"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Check,
  Mail,
  Calendar,
  Bell,
  MessageSquare,
  Info,
  User as UserIcon,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { media as mediaApi, users as usersApi } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { Toggle } from "@/components/ui/Toggle";
import { useSettingsStore } from "@/store/settingsStore";
import { requestNotificationPermission } from "@/lib/sounds";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const settings = useSettingsStore();

  const [displayName, setDisplayName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load form fields when user becomes available
  useEffect(() => {
    if (!user) return;
    setDisplayName(user.display_name);
    setStatusMessage(user.status_message ?? "");
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSaved(false);
    setUploadingAvatar(true);
    try {
      const { upload_url, file_url } = await mediaApi.presignAvatar({
        filename: file.name,
        content_type: file.type || "image/png",
      });
      await mediaApi.uploadToS3(upload_url, file);
      const updated = await usersApi.update({ avatar_url: file_url });
      setUser(updated);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload avatar");
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      setError("Display name cannot be empty");
      return;
    }
    setError(null);
    setSaved(false);
    setSavingProfile(true);
    try {
      const updated = await usersApi.update({
        display_name: displayName.trim(),
        // Send an empty string (not undefined) so clearing the status works
        // (the backend COALESCE only replaces the value when one is sent).
        status_message: statusMessage.trim(),
      });
      setUser(updated);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDesktopNotificationsChange = async (value: boolean) => {
    if (value) {
      const permission = await requestNotificationPermission();
      if (permission === "denied") {
        setError(
          "Notifications are blocked by the browser. Allow them in your browser settings."
        );
        return;
      }
    }
    settings.set({ desktopNotifications: value });
  };

  if (!user) return null;

  const sectionCard = "bg-white rounded-2xl shadow-sm border border-gray-100";

  return (
    <div className="min-h-dvh bg-[#f0f2f5]">
      {/* Header */}
      <div className="bg-[#075e54] text-white">
        <div className="max-w-xl mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.push("/chat")}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Back to chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-sm">Settings</h1>
        </div>
      </div>

      <div className="max-w-xl mx-auto p-4 space-y-4 pb-10">
        {/* ── Profile ─────────────────────────────────────────────────────── */}
        <div className={cn(sectionCard, "p-6")}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
            <UserIcon className="w-4 h-4 text-[#075e54]" />
            Profile
          </h2>
          <div className="flex flex-col items-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="relative group"
              aria-label="Change avatar"
            >
              <Avatar
                src={user.avatar_url}
                name={user.display_name}
                size={96}
                className="ring-4 ring-gray-50"
              />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-7 h-7 text-white" />
              </span>
              {uploadingAvatar && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                  <Spinner size="md" className="text-white" />
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <p className="text-xs text-gray-400 mt-2">
              Tap the avatar to change it
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="display_name"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Display name
              </label>
              <input
                id="display_name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={50}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none
                  focus:border-[#075e54] transition-colors"
              />
            </div>
            <div>
              <label
                htmlFor="status_message"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Status message
              </label>
              <input
                id="status_message"
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value)}
                maxLength={120}
                placeholder="What's on your mind?"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none
                  focus:border-[#075e54] transition-colors"
              />
            </div>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}
            {saved && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-700">
                <Check className="w-4 h-4" />
                Saved
              </div>
            )}
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                bg-[#075e54] hover:bg-[#064d44] text-white text-sm font-medium
                transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingProfile && <Spinner size="sm" className="text-white" />}
              Save changes
            </button>
          </div>
        </div>

        {/* ── Account ─────────────────────────────────────────────────────── */}
        <div className={cn(sectionCard, "p-6 space-y-3")}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Mail className="w-4 h-4 text-[#075e54]" />
            Account
          </h2>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Email</span>
            <span className="text-gray-900 font-medium">{user.email}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Member since</span>
            <span className="text-gray-900 font-medium">
              {new Date(user.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* ── Notifications ───────────────────────────────────────────────── */}
        <div className={cn(sectionCard, "p-6 space-y-5")}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Bell className="w-4 h-4 text-[#075e54]" />
            Notifications
          </h2>
          <Toggle
            checked={settings.playSounds}
            onChange={(v) => settings.set({ playSounds: v })}
            label="Message sounds"
            description="Play a sound when a message arrives in a background chat"
          />
          <Toggle
            checked={settings.desktopNotifications}
            onChange={handleDesktopNotificationsChange}
            label="Desktop notifications"
            description="Show a browser notification for new messages"
          />
        </div>

        {/* ── Chats ───────────────────────────────────────────────────────── */}
        <div className={cn(sectionCard, "p-6 space-y-5")}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <MessageSquare className="w-4 h-4 text-[#075e54]" />
            Chats
          </h2>
          <Toggle
            checked={settings.enterToSend}
            onChange={(v) => settings.set({ enterToSend: v })}
            label="Enter to send"
            description={
              settings.enterToSend
                ? "Enter sends, Shift+Enter adds a new line"
                : "Enter adds a new line, Ctrl+Enter sends"
            }
          />
          <Toggle
            checked={settings.showPreviews}
            onChange={(v) => settings.set({ showPreviews: v })}
            label="Message previews"
            description="Show a preview of the last message in the chat list"
          />
        </div>

        {/* ── About ───────────────────────────────────────────────────────── */}
        <div className={cn(sectionCard, "p-6 space-y-2")}>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Info className="w-4 h-4 text-[#075e54]" />
            About
          </h2>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Version</span>
            <span className="text-gray-900 font-medium">0.1.0</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            A self-hosted WhatsApp-style messenger — Rust + Axum backend with a
            Next.js frontend, real-time WebSockets, and media via S3-compatible
            storage.
          </p>
          <div className="flex items-center gap-1.5 pt-1 text-xs text-gray-400">
            <Calendar className="w-3.5 h-3.5" />
            Made for learning &amp; self-hosting
          </div>
        </div>
      </div>
    </div>
  );
}
