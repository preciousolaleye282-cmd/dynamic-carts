import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutForm } from "@/components/checkout-form";
import { CartLogo } from "@/components/cart-logo";
import { getCurrentUser } from "@/lib/auth";
import { getProfileBySub } from "@/lib/profiles";
import type { Address } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Confirm your delivery details and place your order.",
};

/**
 * Checkout.
 *
 * The cart lives on the client, so this page only supplies what only the server
 * knows: who is signed in and their saved address. The line items, the totals
 * and the stock check all happen server-side in `placeOrder`.
 *
 * The stepper and the trust row come straight from the checkout reference and
 * are static, so they cost no JavaScript.
 */
export default async function CheckoutPage() {
  const user = await getCurrentUser();
  const profile = user ? await getProfileBySub(user.sub) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <CheckoutHeader />

      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Checkout</h1>
        <p className="mt-1 text-sm text-ink-500">
          No payment is taken here - this is a demo store. Your confirmation email is real.
        </p>
      </header>

      <CheckoutForm
        signedIn={user !== null}
        userEmail={user?.email ?? null}
        userName={user?.name ?? null}
        defaultAddress={profile?.defaultAddress ?? null}
      />
    </div>
  );
}

/** The 1 Cart -> 2 Checkout progress indicator from the reference. */
function CheckoutHeader() {
  return (
    <nav
      aria-label="Checkout progress"
      className="mb-8 flex items-center justify-between border-b border-ink-200 pb-5"
    >
      <Link href="/" className="group flex items-center gap-2" aria-label="Dynamic Carts home">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 transition group-hover:bg-brand-500">
          <CartLogo inverted className="h-6 w-6" />
        </span>
      </Link>

      <ol className="flex items-center gap-3 text-sm">
        <li className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-soft text-[11px] font-bold text-emerald-ink">
            1
          </span>
          <span className="text-ink-500">Cart</span>
        </li>
        <span aria-hidden="true" className="h-px w-10 bg-ink-300" />
        <li className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
            2
          </span>
          <span className="font-semibold text-ink-900">Checkout</span>
        </li>
      </ol>

      <p className="inline-flex items-center gap-1.5 text-xs text-emerald-ink">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
          <rect x="5" y="10" width="14" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
        </svg>
        Secure checkout
      </p>
    </nav>
  );
}
