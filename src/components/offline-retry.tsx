"use client";

/**
 * The "Try again" button on the offline page.
 *
 * A hard `location.reload()` rather than a Next router refresh, so the service
 * worker is bypassed and the page genuinely re-fetches from the network. A
 * client-side navigation would be served from the cache and appear to succeed
 * while still being offline, which is worse than the honest failure.
 */
export function OfflineRetry({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="btn btn-primary min-h-11 flex-1 px-6 py-3"
      onClick={() => window.location.reload()}
    >
      {children}
    </button>
  );
}