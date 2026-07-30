import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isHydrated: boolean;

  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null) => void;
  setHydrated: (value: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isHydrated: false,

      setUser: (user) => set({ user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setHydrated: (isHydrated) => set({ isHydrated }),

      logout: () =>
        set({
          user: null,
          accessToken: null,
        }),
    }),
    {
      name: "wa-auth",
      // Only persist the user object; access token is re-fetched on mount
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
