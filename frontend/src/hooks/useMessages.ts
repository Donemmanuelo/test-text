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
  const queryClient = useQueryClient();

  // Select only the slices this hook needs. Using the whole store in an effect
  // dependency causes an infinite update loop (every setMessages write would
  // change the store reference and re-trigger the effect).
  const messages = useChatStore((s) => s.messages[roomId] ?? []);
  const setMessages = useChatStore((s) => s.setMessages);
  const setCursor = useChatStore((s) => s.setCursor);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const markMessageRead = useChatStore((s) => s.markMessageRead);

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

  // Sync to Zustand (guard against redundant writes to avoid render loops)
  useEffect(() => {
    if (!query.data) return;
    // Each page is newest-first (backend orders DESC). Flattening pages gives
    // newest → oldest; reverse so the store holds chronological order
    // (oldest → newest) for correct rendering and appending.
    const allMessages = query.data.pages.flatMap((p) => p.messages).reverse();
    const existing = useChatStore.getState().messages[roomId] ?? [];
    const isSame =
      existing.length === allMessages.length &&
      existing.every((m, i) => m.id === allMessages[i].id);
    if (!isSame) {
      setMessages(roomId, allMessages);
    }

    const lastCursor =
      query.data.pages[query.data.pages.length - 1]?.next_cursor ?? null;
    if (useChatStore.getState().cursors[roomId] !== lastCursor) {
      setCursor(roomId, lastCursor);
    }
  }, [query.data, roomId, setMessages, setCursor]);

  const sendMutation = useMutation({
    mutationFn: (data: SendMessageRequest) =>
      messagesApi.send(roomId, data),
    onSuccess: (msg) => {
      appendMessage(msg);
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
  });

  const readMutation = useMutation({
    mutationFn: (messageId: string) => messagesApi.read(messageId),
  });

  const editMutation = useMutation({
    mutationFn: ({
      messageId,
      content,
    }: {
      messageId: string;
      content: string;
    }) => messagesApi.edit(messageId, content),
    onSuccess: (msg) => updateMessage(msg),
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => messagesApi.delete(messageId),
    onSuccess: (_data, messageId) => deleteMessage(messageId, roomId),
  });

  return {
    messages,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasMore: query.hasNextPage,
    isFetchingMore: query.isFetchingNextPage,
    loadOlder: query.fetchNextPage,
    sendMessage: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    markRead: readMutation.mutate,
    editMessage: editMutation.mutateAsync,
    isEditing: editMutation.isPending,
    deleteMessage: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
