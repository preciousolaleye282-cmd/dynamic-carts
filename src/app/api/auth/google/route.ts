import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createOAuthEnvelope,
  googleAuthorizeUrl,
  hasGoogleAuth,
  oauthCookieOptions,
  OAUTH_COOKIE,
} from "@/lib/auth";
import { env } from "@/lib/env";

/**
 * Step 1 of Google sign-in: mint a state + PKCE pair, stash them in a short
 * lived httpOnly cookie, and bounce the browser to Google.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!hasGoogleAuth) {
    return NextResponse.json(
      {
        error:
          "Google sign-in is not configured. Set GOOGLE_CLIENT_ID, " +
          "GOOGLE_CLIENT_SECRET and SESSION_SECRET - see .env.example.",
      },
      { status: 501 },
    );
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("returnTo") ?? "/";

  // Only same-origin *relative* paths. Without this, ?returnTo=https://evil.test
  // would turn the sign-in into an open redirect.
  const returnTo =
    requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  const { state, verifier, token } = createOAuthEnvelope(returnTo);

  const jar = await cookies();
  jar.set(OAUTH_COOKIE, token, oauthCookieOptions);

  console.info(
    `[dynamic-carts] Google sign-in started -> ${env.googleRedirectUri}`,
  );

  // 302 so the code lands in the query string, not the fragment.
  return NextResponse.redirect(googleAuthorizeUrl(state, verifier), { status: 302 });
}
