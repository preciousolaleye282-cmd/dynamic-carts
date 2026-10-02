import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createSessionToken,
  exchangeCodeForTokens,
  fetchGoogleProfile,
  hasGoogleAuth,
  OAUTH_COOKIE,
  oauthCookieOptions,
  readOAuthEnvelope,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { upsertProfile } from "@/lib/profiles";

/**
 * Step 2 of Google sign-in: exchange the code, read the profile, create or
 * update the local profile row, then set the session cookie.
 *
 * Everything that can fail here ends on the login page with a reason rather
 * than a stack trace, because this redirect is driven entirely by Google.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const jar = await cookies();

  // Single-use: burn the envelope whatever happens next.
  const envelope = readOAuthEnvelope(jar.get(OAUTH_COOKIE)?.value);
  jar.set(OAUTH_COOKIE, "", { ...oauthCookieOptions, maxAge: 0 });

  const fail = (reason: string, status = 400) => {
    const target = new URL("/login", url.origin);
    target.searchParams.set("error", reason);
    return NextResponse.redirect(target, { status: 302 });
  };

  if (!hasGoogleAuth) {
    return fail("Google sign-in is not configured on this server.", 501);
  }

  const providerError = url.searchParams.get("error");
  if (providerError) {
    return fail(
      url.searchParams.get("error_description") ?? `Google returned: ${providerError}`,
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return fail("Google did not send an authorization code.");
  }

  // CSRF: the state must match the one we issued, and the envelope must exist.
  if (!envelope || envelope.state !== state) {
    return fail("Your sign-in attempt expired. Please try again.", 401);
  }

  let user;
  try {
    const tokens = await exchangeCodeForTokens(code, envelope.verifier);
    if (!tokens.access_token) {
      return fail("Google did not return an access token.");
    }
    user = await fetchGoogleProfile(tokens.access_token);
  } catch (error) {
    console.error("[dynamic-carts] Google sign-in failed:", error);
    return fail("Google sign-in could not be completed. Please try again.", 502);
  }

  // Create/refresh the profile row. Failure here is not fatal: the session is
  // still valid and the cart lives in localStorage until the database exists.
  let profileId: string | null = null;
  try {
    const profile = await upsertProfile(user);
    profileId = profile?.id ?? null;
  } catch (error) {
    console.error("[dynamic-carts] could not persist the profile:", error);
  }

  jar.set(SESSION_COOKIE, createSessionToken(user), sessionCookieOptions);

  const target = new URL(envelope.returnTo, url.origin);
  if (profileId) target.searchParams.set("welcome", "1");
  return NextResponse.redirect(target, { status: 302 });
}
