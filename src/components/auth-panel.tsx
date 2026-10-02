import Link from "next/link";
import { CartLogo } from "@/components/cart-logo";
import { hasDatabase, hasGoogleAuth } from "@/lib/env";

/**
 * The shared sign-in / sign-up surface.
 *
 * Google does not distinguish between registering and returning - the same
 * authorization code flow covers both, and the callback upserts the profile
 * row either way. So both pages render this and differ only in their copy.
 * Duplicating the button would be the alternative, and it would drift.
 */

type Mode = "signin" | "signup";

const COPY: Record<
  Mode,
  { title: string; blurb: string; action: string; altIntro: string; altAction: string }
> = {
  signin: {
    title: "Log in to Dynamic Carts",
    blurb:
      "One tap with Google. We only use your email for order confirmations - no passwords, no marketing list.",
    action: "Continue with Google",
    altIntro: "New here?",
    altAction: "Create an account",
  },
  signup: {
    title: "Create your Dynamic Carts account",
    blurb:
      "Sign up with Google in one tap. Your wishlist, saved address and order history follow you between devices.",
    action: "Sign up with Google",
    altIntro: "Already have an account?",
    altAction: "Log in",
  },
};

export function AuthPanel({
  mode,
  next,
  error,
}: {
  mode: Mode;
  /** Same-origin relative path to land on afterwards. */
  next: string;
  error?: string;
}) {
  const copy = COPY[mode];
  const otherMode: Mode = mode === "signin" ? "signup" : "signin";
  const otherHref =
    otherMode === "signup"
      ? `/signup?next=${encodeURIComponent(next)}`
      : `/login?next=${encodeURIComponent(next)}`;

  return (
    <div className="mx-auto max-w-md space-y-6 py-8">
      <header className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-600">
          <CartLogo inverted className="h-9 w-9" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-900">
          {copy.title}
        </h1>
        <p className="mt-2 text-sm text-ink-600">{copy.blurb}</p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-card border border-rose-soft bg-rose-soft px-4 py-3 text-sm text-rose-ink"
        >
          {error}
        </p>
      )}

      <div className="card-surface p-6">
        {hasGoogleAuth ? (
          <>
            <a
              href={`/api/auth/google?returnTo=${encodeURIComponent(next)}`}
              className="btn btn-ghost w-full gap-3 px-6 py-3.5 text-sm"
            >
              <GoogleMark />
              {copy.action}
            </a>
            <p className="mt-4 text-center text-xs text-ink-400">
              You will be sent to Google and brought straight back here.
            </p>
          </>
        ) : (
          <div className="text-center">
            <p className="font-semibold text-ink-900">Sign-in is not switched on yet.</p>
            <p className="mt-1 text-sm text-ink-500">
              Add these three variables to <code className="text-xs">.env.local</code> and
              restart the dev server:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-ink-100 px-3 py-2 text-left text-xs text-ink-700">
              {`GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=...`}
            </pre>
          </div>
        )}
      </div>

      {/* One account system, so there is only ever one real button. This just
          points at it under whichever name the visitor came in expecting. */}
      <p className="text-center text-sm text-ink-500">
        {copy.altIntro}{" "}
        <Link href={otherHref} className="font-semibold text-brand-600 hover:underline">
          {copy.altAction}
        </Link>
      </p>

      {!hasDatabase && (
        <p className="rounded-card border border-amber-soft bg-amber-soft px-4 py-3 text-sm text-amber-ink">
          You do not need an account to shop. Guests can check out with just an email
          address, and their cart lives in this browser.
        </p>
      )}

      <p className="text-center text-sm text-ink-500">
        <Link href="/" className="underline hover:text-brand-700">
          Back to the shop
        </Link>
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6v-3h-4a12 12 0 0 0 0 10.7l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8z"
      />
    </svg>
  );
}
