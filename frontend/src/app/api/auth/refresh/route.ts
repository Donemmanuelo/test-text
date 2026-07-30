import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60;

/**
 * POST /api/auth/refresh
 *
 * Reads the httpOnly refresh token cookie and exchanges it for a new
 * access token via the Rust backend.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const refreshToken = req.cookies.get("wa_refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json(
      { message: "No refresh token" },
      { status: 401 }
    );
  }

  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!backendRes.ok) {
      const errResponse = NextResponse.json(
        { message: "Refresh failed" },
        { status: 401 }
      );
      errResponse.cookies.delete("wa_refresh_token");
      return errResponse;
    }

    const data = (await backendRes.json()) as {
      access_token: string;
      refresh_token: string;
    };

    const response = NextResponse.json(
      { access_token: data.access_token, expires_in: 900 },
      { status: 200 }
    );

    response.cookies.set("wa_refresh_token", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REFRESH_TOKEN_MAX_AGE,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
