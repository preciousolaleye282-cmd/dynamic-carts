import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

/**
 * Sign out. POST is the primary path (the header uses a small form) because
 * logging out via a plain GET link is trivially triggerable by any third-party
 * image tag. GET is still allowed so the route can be exercised by hand.
 */
async function clearSession(request: Request): Promise<NextResponse> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return NextResponse.redirect(new URL("/", request.url), { status: 302 });
}

export async function POST(request: Request): Promise<NextResponse> {
  return clearSession(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  return clearSession(request);
}
