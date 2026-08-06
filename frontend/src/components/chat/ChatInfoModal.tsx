"use client";

import { useEffect, useRef, useState } from "react";
import { X, Search, Plus, Shield } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import { rooms as roomsApi, users as usersApi } from "@/lib/api";
import type { Room, RoomMember, User } from "@/lib/types";

interface ChatInfoModalProps {
  room: Room;
  currentUser: User;
  onClose: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

export function ChatInfoModal({ room, currentUser, onClose }: ChatInfoModalProps) {
  const isAdmin = room.members.some(
    (m) => m.user_id === currentUser.id && m.role === "admin"
  );
  const isGroup = room.is_group;

  // Other member for 1:1 chats
  const otherMember = !isGroup
    ? room.members.find((m) => m.user_id !== currentUser.id)?.user
    : undefined;

  const [addedMembers, setAddedMembers] = useState<RoomMember[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        const found = await usersApi.search(q);
        const memberIds = new Set([
          ...room.members.map((m) => m.user_id),
          ...addedMembers.map((m) => m.user_id),
        ]);
        setResults(found.filter((u) => u.id !== currentUser.id && !memberIds.has(u.id)));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, room.members, addedMembers, currentUser.id]);

  const handleAdd = async (user: User) => {
    setAddingId(user.id);
    setError(null);
    try {
      const member = await roomsApi.addMember(room.id, user.id);
      setAddedMembers((prev) => [...prev, { ...member, user }]);
      setQuery("");
      setResults([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAddingId(null);
    }
  };

  const allMembers = [...room.members, ...addedMembers];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-10 px-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#075e54] text-white">
          <h2 className="font-semibold text-sm">
            {isGroup ? "Group info" : "Contact info"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Contact profile (1:1) */}
        {!isGroup && otherMember && (
          <div className="flex flex-col items-center px-6 py-6">
            <Avatar src={otherMember.avatar_url} name={otherMember.display_name} size={88} />
            <p className="text-base font-semibold text-gray-900 mt-3">
              {otherMember.display_name}
            </p>
            {otherMember.status_message && (
              <p className="text-sm text-gray-500 mt-1">{otherMember.status_message}</p>
            )}
            <div className="w-full mt-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Member since</span>
                <span className="text-gray-700">
                  {new Date(room.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Group members */}
        {isGroup && (
          <div className="py-3">
            <div className="flex items-center justify-between px-4 pb-2">
              <p className="text-sm font-semibold text-gray-700">
                {allMembers.length} member{allMembers.length !== 1 ? "s" : ""}
              </p>
              {isAdmin && (
                <button
                  onClick={() => setShowAdd((v) => !v)}
                  className="flex items-center gap-1 text-sm font-medium text-[#075e54] hover:text-[#064d44]"
                >
                  <Plus className="w-4 h-4" />
                  Add member
                </button>
              )}
            </div>

            {/* Add member search */}
            {showAdd && (
              <div className="px-4 pb-3 space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search people to add…"
                    className="w-full pl-9 pr-4 py-2 rounded-xl bg-gray-100 text-sm outline-none
                      focus:bg-white focus:ring-1 focus:ring-[#075e54] transition-all placeholder:text-gray-400"
                  />
                </div>
                {error && <p className="text-xs text-red-500">{error}</p>}
                <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-100">
                  {isSearching ? (
                    <div className="flex justify-center py-6">
                      <Spinner size="sm" className="text-[#075e54]" />
                    </div>
                  ) : results.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 py-6">
                      {query.trim() ? "No one found" : "Search to find people"}
                    </p>
                  ) : (
                    results.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleAdd(u)}
                        disabled={addingId === u.id}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left disabled:opacity-60"
                      >
                        <Avatar src={u.avatar_url} name={u.display_name} size={36} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-gray-900 truncate">
                            {u.display_name}
                          </span>
                          {u.status_message && (
                            <span className="block text-xs text-gray-400 truncate">
                              {u.status_message}
                            </span>
                          )}
                        </span>
                        {addingId === u.id ? (
                          <Spinner size="sm" />
                        ) : (
                          <Plus className="w-4 h-4 text-[#075e54]" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Member rows */}
            <div className="max-h-72 overflow-y-auto">
              {allMembers.map((m) => {
                const isSelf = m.user_id === currentUser.id;
                return (
                  <div
                    key={m.user_id}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <Avatar
                      src={m.user.avatar_url}
                      name={m.user.display_name}
                      size={40}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {m.user.display_name}
                        {isSelf && <span className="text-gray-400 font-normal"> (you)</span>}
                      </p>
                      {m.user.status_message && (
                        <p className="text-xs text-gray-400 truncate">
                          {m.user.status_message}
                        </p>
                      )}
                    </div>
                    {m.role === "admin" && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-gray-400">
                        <Shield className="w-3 h-3" />
                        Admin
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
