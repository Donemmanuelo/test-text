import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AppSettings {
  /** Play a short sound when a message arrives in a non-active room. */
  playSounds: boolean;
  /** Show browser desktop notifications for new messages. */
  desktopNotifications: boolean;
  /** Enter sends (Shift+Enter newline); when off, Enter is newline and Ctrl+Enter sends. */
  enterToSend: boolean;
  /** Show message previews in the chat list sidebar. */
  showPreviews: boolean;
  /** Room ids with notifications silenced. */
  mutedRooms: string[];
  set: (patch: Partial<AppSettings>) => void;
  toggleMuteRoom: (roomId: string) => void;
}

export const useSettingsStore = create<AppSettings>()(
  persist(
    (set) => ({
      playSounds: true,
      desktopNotifications: false,
      enterToSend: true,
      showPreviews: true,
      mutedRooms: [],
      set: (patch) => set(patch),
      toggleMuteRoom: (roomId) =>
        set((state) => ({
          mutedRooms: state.mutedRooms.includes(roomId)
            ? state.mutedRooms.filter((id) => id !== roomId)
            : [...state.mutedRooms, roomId],
        })),
    }),
    {
      name: "wa-settings",
    }
  )
);
