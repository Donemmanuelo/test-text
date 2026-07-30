"use client";

import { useState, useMemo } from "react";
import { Search, Plus, LogOut, MessageCircle } from "lucide-react";
import { RoomItem } from "./RoomItem";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { useRooms } from "@/hooks/useRooms";
import { useChatStore } from "@/store/chatStore";
import type { Room } from "@/lib/types";

interface SidebarProps {
  activeRoomId?: string;
}

export function Sidebar({ activeRoomId }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { user, logout } = useAuth();
  const { rooms, isLoading, isError } = useRooms();

  const filteredRooms = useMemo(() => {
    if (!searchQuery.trim()) return rooms;
    const q = searchQuery.toLowerCase();
    return rooms.filter((room) => {
      const name = room.is_group
        ? (room.name ?? "")
        : (room.members.find((m) => m.user_id !== user?.id)?.user.display_name ?? "");
      return (
        name.toLowerCase().includes(q) ||
        (room.last_message?.content ?? "").toLowerCase().includes(q)
      );
    });
  }, [rooms, searchQuery, user]);

  return (
    <aside className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#075e54] text-white shrink-0">
        <div className="flex items-center gap-2.5">
          {user && (
            <Avatar
              src={user.avatar_url}
              name={user.display_name}
              size={36}
            />
          )}
          <span className="font-semibold text-sm">{user?.display_name ?? "Chat"}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="New chat"
            title="New chat"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Sign out"
            title="Sign out"
            onClick={logout}
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search chats"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-full bg-gray-100 text-sm outline-none
              focus:bg-white focus:ring-1 focus:ring-[#075e54] transition-all
              placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner size="md" className="text-[#075e54]" />
          </div>
        )}

        {isError && (
          <div className="px-4 py-6 text-center text-sm text-red-500">
            Failed to load chats. Check your connection.
          </div>
        )}

        {!isLoading && !isError && filteredRooms.length === 0 && (
          <div className="flex flex-col items-center py-12 text-center px-6">
            <MessageCircle className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-400">
              {searchQuery ? "No chats found" : "No conversations yet"}
            </p>
            <p className="text-xs text-gray-300 mt-1">
              {searchQuery
                ? "Try a different search"
                : "Start a new chat with the + button"}
            </p>
          </div>
        )}

        {!isLoading &&
          filteredRooms.map((room: Room) => (
            <RoomItem
              key={room.id}
              room={room}
              isActive={room.id === activeRoomId}
            />
          ))}
      </div>
    </aside>
  );
}
