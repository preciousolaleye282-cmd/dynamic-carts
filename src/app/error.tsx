"use client";

import Link from "next/link";

/**
 * The route-segment error boundary.
 *
 * It renders inside the root layout, so it must NOT emit <html>/<body> - only
 * global-error.tsx does that. It also deliberately shows nothing but a reset
 * button: server errors here can carry SQL text or provider error bodies, and
 * that has no business being rendered in a customer's browser. The details go to
 * the server log instead.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-soft text-lg font-bold text-rose-ink">
        !
      </span>
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">
        Something went wrong
      </h1>
      <p className="text-ink-600">
        This page could not be rendered. Trying again often clears it.
      </p>
      {error.digest && (
        <p className="text-xs text-ink-400">Reference: {error.digest}</p>
      )}
      <div className="mt-2 flex gap-3">
        <button type="button" onClick={reset} className="btn btn-primary px-6 py-3 text-sm">
          Try again
        </button>
        <Link href="/" className="btn btn-ghost px-6 py-3 text-sm">
          Go home
        </Link>
      </div>
    </div>
  );
}
