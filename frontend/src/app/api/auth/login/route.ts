import { NextRequest, NextResponse } from "next/server";

const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * POST /api/auth/login
 *
 * Called by the frontend after it has already received tokens from the backend.
 * Sets httpOnly cookies for the refresh token.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      access_token: string;
      refresh_token: string;
    };

    if (!body.access_token || !body.refresh_token) {
      return NextResponse.json(
        { message: "Missing tokens" },
        { status: 400 }
      );
    }

    const response = NextResponse.json({ ok: true }, { status: 200 });

    response.cookies.set("wa_refresh_token", body.refresh_token, {
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
