"use client";

import { useTypingUsers } from "@/hooks/usePresence";
import { useChatStore } from "@/store/chatStore";
import { useAuthStore } from "@/store/authStore";
import type { Room } from "@/lib/types";

interface TypingIndicatorProps {
  room: Room;
}

export function TypingIndicator({ room }: TypingIndicatorProps) {
  const currentUser = useAuthStore((s) => s.user);
  const typingUserIds = useTypingUsers(room.id);

  // Exclude self from typing display
  const othersTyping = typingUserIds.filter((id) => id !== currentUser?.id);

  if (othersTyping.length === 0) return null;

  // Resolve display names
  const names = othersTyping
    .map((id) => room.members.find((m) => m.user_id === id)?.user.display_name)
    .filter(Boolean) as string[];

  const label =
    names.length === 1
      ? `${names[0]} is typing…`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing…`
      : `${names.slice(0, 2).join(", ")} and others are typing…`;

  return (
    <div className="flex items-center gap-2 px-4 py-1 text-xs text-gray-400 italic animate-fade-in">
      {/* Animated dots */}
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400"
            style={{
              animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </span>
      <style jsx>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
      <span>{label}</span>
    </div>
  );
}
