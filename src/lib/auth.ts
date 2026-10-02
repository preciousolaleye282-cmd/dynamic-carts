import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env, hasGoogleAuth, isProduction } from "./env";
import type { SessionUser } from "./types";

/**
 * Google sign-in, implemented directly against the Google Cloud Console
 * credentials (OAuth 2.0 authorization code flow + PKCE), so there is no auth
 * framework in the way and no hidden session database to provision.
 *
 * Console setup (see README for the click-by-click):
 *   1. Google Cloud Console -> "APIs & Services" -> "Credentials"
 *   2. "Create credentials" -> "OAuth client ID" -> "Web application"
 *   3. Authorised redirect URI: {APP_URL}/api/auth/callback/google
 *   4. Copy the Client ID / Client secret into GOOGLE_CLIENT_ID /
 *      GOOGLE_CLIENT_SECRET
 */

export const SESSION_COOKIE = "dc_session";
/** Short-lived cookie holding the OAuth `state` + PKCE verifier. */
const OAUTH_COOKIE = "dc_oauth";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const OAUTH_TTL_SECONDS = 60 * 10; // 10 minutes

// ---------------------------------------------------------------------------
// base64url + HMAC helpers
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function hmac(input: string): string {
  return base64url(
    createHmac("sha256", env.sessionSecret ?? "dev-insecure-secret")
      .update(input)
      .digest(),
  );
}

/** `payload.signature`, verified with a constant-time compare. */
function signToken(payload: object): string {
  const body = base64url(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}

function readToken<T>(token: string | undefined): T | null {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const signature = token.slice(separator + 1);
  const expected = hmac(token.slice(0, separator));

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(fromBase64url(token.slice(0, separator)).toString("utf8")) as
      | (T & { exp?: number });
    if (typeof parsed.exp === "number" && parsed.exp * 1000 < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Session cookie
// ---------------------------------------------------------------------------

export function createSessionToken(user: SessionUser): string {
  return signToken({
    sub: user.sub,
    email: user.email,
    name: user.name,
    picture: user.picture,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  });
}

/**
 * The signed-in user for the current request, or null.
 *
 * The cookie is HMAC-signed and httpOnly, and every read re-verifies the
 * signature, so this is the only place identity enters the app. Callers get a
 * plain `SessionUser` - never the raw token.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const payload = readToken<SessionUser>(jar.get(SESSION_COOKIE)?.value);
  if (!payload || typeof payload.sub !== "string" || typeof payload.email !== "string") {
    return null;
  }
  return {
    sub: payload.sub,
    email: payload.email,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: isProduction,
  maxAge: SESSION_TTL_SECONDS,
};

export const oauthCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: isProduction,
  maxAge: OAUTH_TTL_SECONDS,
};

/** The signed-in user for the current request, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!env.sessionSecret) return null;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = readToken<SessionUser>(token);
  if (!payload?.sub || !payload?.email) return null;
  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    picture: payload.picture ?? null,
  };
}

// ---------------------------------------------------------------------------
// PKCE + state
// ---------------------------------------------------------------------------

type OAuthEnvelope = {
  state: string;
  verifier: string;
  returnTo: string;
  exp: number;
};

export function createOAuthEnvelope(returnTo: string) {
  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(48));
  const token = signToken({
    state,
    verifier,
    returnTo,
    exp: Math.floor(Date.now() / 1000) + OAUTH_TTL_SECONDS,
  });
  // The verifier is returned so the start route can send its S256 challenge to
  // Google. Only the signed token goes in the cookie.
  return { state, verifier, token };
}

export function readOAuthEnvelope(token: string | undefined): OAuthEnvelope | null {
  return readToken<OAuthEnvelope>(token);
}

/**
 * PKCE S256 challenge.
 *
 * RFC 7636 specifies a plain SHA-256 hash of the verifier - NOT an HMAC. Using
 * createHmac here (with the verifier as the key) produces a value Google will
 * reject with "code_verifier does not match".
 */
function pkceChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}


// ---------------------------------------------------------------------------
// The OAuth 2.0 dance
// ---------------------------------------------------------------------------

export function googleAuthorizeUrl(state: string, verifier: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId ?? "",
    redirect_uri: env.googleRedirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function exchangeCodeForTokens(
  code: string,
  verifier: string,
): Promise<TokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId ?? "",
      client_secret: env.googleClientSecret ?? "",
      redirect_uri: env.googleRedirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });

  const body = (await response.json()) as TokenResponse;
  if (!response.ok) {
    throw new Error(
      `Google token exchange failed (${response.status}): ` +
        `${body.error_description ?? body.error ?? "unknown"}`,
    );
  }
  return body;
}

/** Call the userinfo endpoint with the access token we just received. */
export async function fetchGoogleProfile(accessToken: string): Promise<SessionUser> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Google userinfo failed (${response.status}).`);
  }

  const info = (await response.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (!info.sub || !info.email) {
    throw new Error("Google did not return a usable account (sub/email missing).");
  }
  return {
    sub: info.sub,
    email: info.email.toLowerCase(),
    name: info.name ?? null,
    picture: info.picture ?? null,
  };
}

export { hasGoogleAuth, OAUTH_COOKIE };
