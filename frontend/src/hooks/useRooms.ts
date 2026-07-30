import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rooms as roomsApi } from "@/lib/api";
import { useChatStore } from "@/store/chatStore";
import type { CreateRoomRequest, Room } from "@/lib/types";
import { useEffect } from "react";

export const ROOMS_QUERY_KEY = ["rooms"] as const;

export function useRooms() {
  const { setRooms, upsertRoom } = useChatStore();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ROOMS_QUERY_KEY,
    queryFn: async () => {
      const data = await roomsApi.list();
      // Sort by last message time descending
      return data.sort((a, b) => {
        const ta = a.last_message?.created_at ?? a.created_at;
        const tb = b.last_message?.created_at ?? b.created_at;
        return new Date(tb).getTime() - new Date(ta).getTime();
      });
    },
  });

  // Sync to Zustand whenever React Query data changes
  useEffect(() => {
    if (query.data) {
      setRooms(query.data);
    }
  }, [query.data, setRooms]);

  const createMutation = useMutation({
    mutationFn: (data: CreateRoomRequest) => roomsApi.create(data),
    onSuccess: (room: Room) => {
      upsertRoom(room);
      queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });
    },
  });

  return {
    rooms: useChatStore((s) => s.rooms),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    createRoom: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
  };
}
