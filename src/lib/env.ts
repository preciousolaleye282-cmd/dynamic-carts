/**
 * Environment configuration, read once and validated in one place.
 *
 * The app is designed to boot with ZERO configuration: with no DATABASE_URL
 * it serves the bundled catalogue from `data/catalogue.json` ("demo mode"),
 * with no Google credentials the sign-in button is hidden, and with no
 * Mailgun key the confirmation email is written to the server log instead of
 * being sent. Every integration switches itself on as soon as its variable
 * is present, so you can paste keys in one at a time.
 */

function read(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function readBool(name: string, fallback: boolean): boolean {
  const value = read(name);
  if (value === null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const APP_URL =
  read("NEXT_PUBLIC_APP_URL") ??
  (read("VERCEL_URL") ? `https://${read("VERCEL_URL")}` : null) ??
  "http://localhost:3000";

export const env = {
  appUrl: APP_URL,

  // --- Database (Supabase or Neon, identical) -------------------------------
  databaseUrl: read("DATABASE_URL"),
  // Both providers require TLS. Set to "false" only for a local Postgres.
  databaseSsl: readBool("DATABASE_SSL", true),
  databasePoolMax: Number(read("DATABASE_POOL_MAX") ?? 10) || 10,

  // --- Google OAuth (Google Cloud Console) ----------------------------------
  googleClientId: read("GOOGLE_CLIENT_ID"),
  googleClientSecret: read("GOOGLE_CLIENT_SECRET"),
  /** Must exactly match an "Authorized redirect URI" in the Cloud Console. */
  googleRedirectUri: read("GOOGLE_REDIRECT_URI") ?? `${APP_URL}/api/auth/callback/google`,

  /** HMAC key for the session cookie. MUST be set in production. */
  sessionSecret: read("SESSION_SECRET"),

  // --- Mailgun --------------------------------------------------------------
  mailgunApiKey: read("MAILGUN_API_KEY"),
  mailgunDomain: read("MAILGUN_DOMAIN"),
  mailgunFrom: read("MAILGUN_FROM"),
  /** Optional override for the API host (e.g. the EU region). */
  mailgunApiHost: read("MAILGUN_API_HOST") ?? "api.mailgun.net",
} as const;

export const isProduction = process.env.NODE_ENV === "production";

/** True when a real database is configured. */
export const hasDatabase = env.databaseUrl !== null;

/** True when the Google Cloud Console credentials are present. */
export const hasGoogleAuth =
  env.googleClientId !== null &&
  env.googleClientSecret !== null &&
  env.sessionSecret !== null;

/** True when the session cookie can be signed. */
export const canSignSessions = env.sessionSecret !== null;

/** True when Mailgun can actually deliver mail. */
export const hasMailgun =
  env.mailgunApiKey !== null &&
  env.mailgunDomain !== null &&
  env.mailgunFrom !== null;

/** Demo mode = serving the bundled catalogue with no database. */
export const isDemoMode = !hasDatabase;

/**
 * Refuse to boot in production without a session secret rather than shipping
 * a site whose cookies are signed with a guessable key.
 */
export function assertProductionConfig(): void {
  if (!isProduction) return;
  const missing: string[] = [];
  if (!env.sessionSecret) missing.push("SESSION_SECRET");
  if (!hasGoogleAuth && !env.googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!hasDatabase) {
    console.warn(
      "[dynamic-carts] WARNING: DATABASE_URL is not set - running in demo mode. " +
        "Orders will not be persisted.",
    );
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(", ")}. ` +
        `See .env.example.`,
    );
  }
}
