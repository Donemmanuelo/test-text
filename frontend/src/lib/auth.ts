/**
 * Auth token helpers.
 *
 * Access tokens are stored in localStorage for SPA usage (short-lived, 15min).
 * Refresh tokens are stored in httpOnly cookies set by Next.js API route handlers
 * (/api/auth/*), so they are never accessible to JavaScript.
 *
 * On each page load the app reads the access token from localStorage; if it
 * has expired it calls /api/auth/refresh which reads the httpOnly cookie
 * automatically and returns a new access token.
 */

const ACCESS_TOKEN_KEY = "wa_access_token";
const ACCESS_TOKEN_EXPIRY_KEY = "wa_access_token_expiry";

export interface StoredAuthSession {
  accessToken: string;
  expiresAt: number; // unix ms
}

/** Persist an access token to localStorage with an expiry time. */
export function storeAccessToken(token: string, expiresInSeconds = 900): void {
  if (typeof window === "undefined") return;
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(ACCESS_TOKEN_EXPIRY_KEY, String(expiresAt));
}

/** Read the stored access token. Returns null if missing or expired. */
export function readAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const expiryStr = localStorage.getItem(ACCESS_TOKEN_EXPIRY_KEY);
  if (!token || !expiryStr) return null;
  const expiresAt = parseInt(expiryStr, 10);
  // Treat as expired 30s early to allow refresh margin
  if (Date.now() > expiresAt - 30_000) {
    clearAccessToken();
    return null;
  }
  return token;
}

/** Clear the stored access token from localStorage. */
export function clearAccessToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_EXPIRY_KEY);
}

/**
 * Attempt to refresh the access token using the httpOnly refresh token cookie.
 * Calls the Next.js API route which proxies to the backend.
 * Returns the new access token on success, null on failure.
 */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      access_token: string;
      expires_in?: number;
    };
    storeAccessToken(data.access_token, data.expires_in ?? 900);
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Logout: clear local storage and call the Next.js logout route to clear
 * the httpOnly refresh token cookie.
 */
export async function logoutSession(): Promise<void> {
  clearAccessToken();
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // best effort
  }
}
