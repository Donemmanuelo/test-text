import {
  useQuery,
  useMutation,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { messages as messagesApi } from "@/lib/api";
import { useChatStore } from "@/store/chatStore";
import type { SendMessageRequest } from "@/lib/types";
import { useEffect } from "react";

export function messagesQueryKey(roomId: string) {
  return ["messages", roomId] as const;
}

export function useMessages(roomId: string) {
  const store = useChatStore();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: messagesQueryKey(roomId),
    queryFn: async ({ pageParam }) => {
      const page = await messagesApi.list(
        roomId,
        pageParam as string | undefined
      );
      return page;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: !!roomId,
  });

  // Sync to Zustand
  useEffect(() => {
    if (!query.data) return;
    const allMessages = query.data.pages.flatMap((p) => p.messages);
    // pages are in reverse chronological order (oldest first in array)
    store.setMessages(roomId, allMessages);
    const lastCursor =
      query.data.pages[query.data.pages.length - 1]?.next_cursor ?? null;
    store.setCursor(roomId, lastCursor);
  }, [query.data, roomId, store]);

  const sendMutation = useMutation({
    mutationFn: (data: SendMessageRequest) =>
      messagesApi.send(roomId, data),
    onSuccess: (msg) => {
      store.appendMessage(msg);
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });

  const readMutation = useMutation({
    mutationFn: (messageId: string) => messagesApi.read(messageId),
  });

  return {
    messages: store.messages[roomId] ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasMore: query.hasNextPage,
    isFetchingMore: query.isFetchingNextPage,
    loadOlder: query.fetchNextPage,
    sendMessage: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    markRead: readMutation.mutate,
  };
}
