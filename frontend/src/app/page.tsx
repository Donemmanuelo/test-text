"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Root page: redirect to /chat if authenticated, otherwise to /login.
 * Waits for Zustand to hydrate from localStorage before deciding.
 */
export default function RootPage() {
  const router = useRouter();
  const { user, isHydrated } = useAuthStore();

  useEffect(() => {
    if (!isHydrated) return;
    if (user) {
      router.replace("/chat");
    } else {
      router.replace("/login");
    }
  }, [isHydrated, user, router]);

  return (
    <div className="h-dvh flex items-center justify-center bg-gray-50">
      <Spinner size="lg" className="text-[#075e54]" />
    </div>
  );
}
