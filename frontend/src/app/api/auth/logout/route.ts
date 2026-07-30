import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

/**
 * POST /api/auth/logout
 *
 * Clears the httpOnly refresh token cookie and notifies the backend.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const refreshToken = req.cookies.get("wa_refresh_token")?.value;

  if (refreshToken) {
    try {
      await fetch(`${BACKEND_URL}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // ignore
    }
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.delete("wa_refresh_token");
  return response;
}
