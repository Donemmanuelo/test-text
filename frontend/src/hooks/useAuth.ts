import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { auth as authApi, setAccessToken } from "@/lib/api";
import { storeAccessToken, clearAccessToken, logoutSession } from "@/lib/auth";
import { destroyWsManager, initWsManager } from "@/lib/ws";
import type { LoginRequest, RegisterRequest } from "@/lib/types";

export function useAuth() {
  const router = useRouter();
  const { user, accessToken, setUser, setAccessToken: storeToken } = useAuthStore();

  const login = useCallback(
    async (data: LoginRequest) => {
      const res = await authApi.login(data);
      storeAccessToken(res.access_token);
      setAccessToken(res.access_token);
      storeToken(res.access_token);
      setUser(res.user);

      // Initialise WebSocket
      initWsManager(res.access_token);

      // Set cookies via Next.js route handler
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: res.access_token,
          refresh_token: res.refresh_token,
        }),
      });

      router.push("/chat");
    },
    [router, setUser, storeToken]
  );

  const register = useCallback(
    async (data: RegisterRequest) => {
      const res = await authApi.register(data);
      storeAccessToken(res.access_token);
      setAccessToken(res.access_token);
      storeToken(res.access_token);
      setUser(res.user);

      initWsManager(res.access_token);

      await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: res.access_token,
          refresh_token: res.refresh_token,
        }),
      });

      router.push("/chat");
    },
    [router, setUser, storeToken]
  );

  const logout = useCallback(async () => {
    destroyWsManager();
    clearAccessToken();
    setAccessToken(null);
    storeToken(null);
    setUser(null);
    await logoutSession();
    router.push("/login");
  }, [router, setUser, storeToken]);

  return {
    user,
    accessToken,
    isAuthenticated: !!user,
    login,
    register,
    logout,
  };
}
