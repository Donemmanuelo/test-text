"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { setAccessToken } from "@/lib/api";
import { readAccessToken, refreshAccessToken } from "@/lib/auth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Layout for all authenticated pages (chat, room, settings).
 * Handles the auth guard + access-token refresh exactly once, and mounts the
 * global WebSocket hook so realtime events (messages, presence, calls) are
 * handled on every page — not just the chat pages.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isHydrated, setAccessToken: storeToken } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isHydrated) return;
    async function init() {
      if (!user) {
        router.replace("/login");
        return;
      }
      let token = readAccessToken();
      if (!token) token = await refreshAccessToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      setAccessToken(token);
      storeToken(token);
      setReady(true);
    }
    void init();
  }, [isHydrated, user, router, storeToken]);

  // Global WebSocket hook — initialises the manager once the access token is
  // in the store and wires all realtime event handlers.
  useWebSocket();

  if (!ready) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-50">
        <Spinner size="lg" className="text-[#075e54]" />
      </div>
    );
  }

  return <>{children}</>;
}
