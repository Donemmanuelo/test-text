"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import { setAccessToken } from "@/lib/api";
import { readAccessToken, refreshAccessToken } from "@/lib/auth";
import { initWsManager, getWsManager } from "@/lib/ws";
import { rooms as roomsApi } from "@/lib/api";
import { Sidebar } from "@/components/chat/Sidebar";
import { MessagePane } from "@/components/chat/MessagePane";
import { Spinner } from "@/components/ui/Spinner";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useRooms } from "@/hooks/useRooms";
import type { Room } from "@/lib/types";

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const router = useRouter();
  const { user, isHydrated, setAccessToken: storeToken } = useAuthStore();
  const { setActiveRoomId } = useChatStore();
  const [isInitialising, setIsInitialising] = useState(true);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const { rooms } = useRooms();

  useEffect(() => {
    if (!isHydrated) return;
    async function init() {
      if (!user) { router.replace("/login"); return; }
      let token = readAccessToken();
      if (!token) token = await refreshAccessToken();
      if (!token) { router.replace("/login"); return; }
      setAccessToken(token);
      storeToken(token);
      if (!getWsManager()) initWsManager(token);
      setIsInitialising(false);
    }
    init();
  }, [isHydrated, user, router, storeToken]);

  useEffect(() => {
    if (isInitialising || !roomId) return;
    const storeRoom = rooms.find((r) => r.id === roomId);
    if (storeRoom) { setRoom(storeRoom); return; }
    roomsApi.get(roomId)
      .then((r) => setRoom(r))
      .catch(() => setRoomError("Room not found or you don't have access."));
  }, [isInitialising, roomId, rooms]);

  useEffect(() => {
    setActiveRoomId(roomId);
    return () => setActiveRoomId(null);
  }, [roomId, setActiveRoomId]);

  useWebSocket();

  if (isInitialising) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-50">
        <Spinner size="lg" className="text-[#075e54]" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <div
        className={`${showMobileSidebar ? "flex" : "hidden"} md:flex
          w-full md:w-80 lg:w-96 shrink-0 h-full flex-col`}
      >
        <Sidebar activeRoomId={roomId} />
      </div>
      <div
        className={`${showMobileSidebar ? "hidden" : "flex"} md:flex
          flex-1 h-full flex-col`}
      >
        {roomError ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <p className="text-red-500 font-medium">{roomError}</p>
              <button
                className="mt-4 text-sm text-[#075e54] hover:underline"
                onClick={() => router.push("/chat")}
              >
                Back to chats
              </button>
            </div>
          </div>
        ) : !room ? (
          <div className="flex-1 flex items-center justify-center">
            <Spinner size="lg" className="text-[#075e54]" />
          </div>
        ) : (
          <MessagePane
            room={room}
            onBack={() => {
              if (typeof window !== "undefined" && window.innerWidth < 768) {
                setShowMobileSidebar(true);
              } else {
                router.push("/chat");
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
