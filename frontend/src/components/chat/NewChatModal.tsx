"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Users, User as UserIcon, X, Check } from "lucide-react";
import { users as usersApi } from "@/lib/api";
import { useRooms } from "@/hooks/useRooms";
import { useAuthStore } from "@/store/authStore";
import { Avatar } from "@/components/ui/Avatar";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

interface NewChatModalProps {
  onClose: () => void;
  initialTab?: Tab;
}

type Tab = "dm" | "group";

const SEARCH_DEBOUNCE_MS = 300;

export function NewChatModal({ onClose, initialTab = "dm" }: NewChatModalProps) {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const { createRoom, isCreating } = useRooms();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, User>>(new Map());
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Debounced user search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const q = query.trim();
    if (!q) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const reqId = ++requestIdRef.current;
      setIsSearching(true);
      setError(null);
      try {
        const found = await usersApi.search(q);
        if (requestIdRef.current !== reqId) return; // stale response
        setResults(
          found.filter((u) => u.id !== currentUser?.id)
        );
      } catch (err: unknown) {
        if (requestIdRef.current !== reqId) return;
        setResults([]);
        setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        if (requestIdRef.current === reqId) setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, currentUser?.id]);

  const toggleMember = useCallback((user: User) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(user.id)) next.delete(user.id);
      else next.set(user.id, user);
      return next;
    });
  }, []);

  const startDm = useCallback(
    async (user: User) => {
      setCreatingId(user.id);
      setError(null);
      try {
        const room = await createRoom({
          member_ids: [user.id],
          is_group: false,
        });
        onClose();
        router.push(`/chat/${room.id}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to start chat");
        setCreatingId(null);
      }
    },
    [createRoom, onClose, router]
  );

  const createGroup = useCallback(async () => {
    const name = groupName.trim();
    if (!name || selected.size === 0) return;
    setCreatingId("group");
    setError(null);
    try {
      const room = await createRoom({
        name,
        member_ids: Array.from(selected.keys()),
        is_group: true,
      });
      onClose();
      router.push(`/chat/${room.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create group");
      setCreatingId(null);
    }
  }, [createRoom, groupName, selected, onClose, router]);

  const selectedUsers = Array.from(selected.values());

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm pt-16 px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#075e54] text-white">
          <h2 className="font-semibold text-sm">Start a new chat</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          {(
            [
              { id: "dm", label: "New chat", icon: UserIcon },
              { id: "group", label: "New group", icon: Users },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setError(null);
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors",
                tab === id
                  ? "text-[#075e54] border-b-2 border-[#075e54]"
                  : "text-gray-400 hover:text-gray-600"
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Group name (group tab only) */}
        {tab === "group" && (
          <div className="px-4 pt-3">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              maxLength={50}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm outline-none
                focus:border-[#075e54] transition-colors"
            />
          </div>
        )}

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                tab === "dm"
                  ? "Search by name or email…"
                  : "Add members by name or email…"
              }
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-gray-100 text-sm outline-none
                focus:bg-white focus:ring-1 focus:ring-[#075e54] transition-all
                placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Selected members (group tab) */}
        {tab === "group" && selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {selectedUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => toggleMember(u)}
                className="flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-[#075e54]/10 text-xs font-medium text-[#075e54] hover:bg-[#075e54]/20 transition-colors"
              >
                <Avatar src={u.avatar_url} name={u.display_name} size={20} />
                {u.display_name}
                <X className="w-3 h-3" />
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="px-2 py-2 max-h-72 overflow-y-auto">
          {isSearching ? (
            <div className="flex justify-center py-10">
              <Spinner size="md" className="text-[#075e54]" />
            </div>
          ) : query.trim() && results.length === 0 && !error ? (
            <p className="text-center text-sm text-gray-400 py-10">
              No users found
            </p>
          ) : !query.trim() ? (
            <p className="text-center text-sm text-gray-400 py-10">
              {tab === "dm"
                ? "Search for someone to start chatting"
                : "Search for people to add to the group"}
            </p>
          ) : (
            results.map((u) => {
              const isSelected = selected.has(u.id);
              const isBusy = creatingId === u.id;
              return (
                <button
                  key={u.id}
                  onClick={() =>
                    tab === "dm" ? startDm(u) : toggleMember(u)
                  }
                  disabled={isBusy || isCreating}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60 text-left"
                >
                  <Avatar src={u.avatar_url} name={u.display_name} size={42} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {u.display_name}
                    </p>
                    {u.status_message && (
                      <p className="text-xs text-gray-400 truncate">
                        {u.status_message}
                      </p>
                    )}
                  </div>
                  {tab === "group" ? (
                    <span
                      className={cn(
                        "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                        isSelected
                          ? "bg-[#075e54] border-[#075e54] text-white"
                          : "border-gray-300"
                      )}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </span>
                  ) : isBusy ? (
                    <Spinner size="sm" />
                  ) : (
                    <span className="text-xs font-medium text-[#075e54]">
                      Chat
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer (group tab) */}
        {tab === "group" && (
          <div className="px-4 py-3 border-t border-gray-100">
            <button
              onClick={createGroup}
              disabled={
                isCreating ||
                !groupName.trim() ||
                selected.size === 0
              }
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                bg-[#075e54] hover:bg-[#064d44] text-white text-sm font-medium
                transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating && <Spinner size="sm" className="text-white" />}
              Create group
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
