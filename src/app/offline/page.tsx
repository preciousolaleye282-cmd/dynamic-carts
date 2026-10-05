import Link from "next/link";
import { CartLogo } from "@/components/cart-logo";
import { OfflineRetry } from "@/components/offline-retry";

/**
 * Served by the service worker when the network is gone.
 *
 * Deliberately a server component with no `useSearchParams` or cart access: the
 * whole point is that this renders with zero network. It offers a retry rather
 * than pretending the cart is intact - an offline cart would be a lie, since
 * nothing here can confirm stock.
 */
export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-600">
        <CartLogo inverted className="h-9 w-9" />
      </span>

      <h1 className="mt-6 text-2xl font-bold text-ink-900">You are offline</h1>

      <p className="mt-3 text-sm leading-relaxed text-ink-500">
        This page needs a connection. Reconnect and it will load straight away -
        anything you had added to your cart is saved on your account and will
        still be there.
      </p>

      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <OfflineRetry>Try again</OfflineRetry>

        <Link
          href="/"
          className="btn min-h-11 flex-1 border border-ink-200 px-6 py-3 text-ink-900"
        >
          Go to the shop
        </Link>
      </div>
    </div>
  );
}