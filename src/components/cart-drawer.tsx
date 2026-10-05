"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useCart } from "@/lib/cart";
import {
  computeTotals,
  formatCents,
  FREE_SHIPPING_THRESHOLD_CENTS,
} from "@/lib/money";
import { ProductImage } from "./product-image";

/**
 * Slide-over cart. Closes on Escape and restores focus. The totals shown here
 * are a preview only - checkout recomputes everything server-side.
 */
export function CartDrawer() {
  const cart = useCart();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // The "Your cart" app shortcut launches `/?cart=open`, and a deep link to a
  // product should reveal its cart too. Read the flag once on mount and strip it
  // from the URL, so a refresh does not re-open a drawer the user has closed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("cart") !== "open") return;
    cart.open();
    params.delete("cart");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
    // Mount-only by design; `cart.open` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cart.isOpen) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cart.close();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [cart.isOpen, cart.close]);

  if (!cart.isOpen) return null;

  const totals = computeTotals(
    cart.lines.map((line) => ({
      priceCents: line.product.priceCents,
      quantity: line.quantity,
    })),
  );

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Shopping cart"
    >
      <button
        type="button"
        aria-label="Close cart"
        onClick={cart.close}
        className="absolute inset-0 h-full w-full cursor-default bg-ink-900/40"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-ink-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
          <h2 className="text-lg font-bold text-ink-900">
            Your cart
            {cart.ready && cart.count > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-500">
                {cart.count} item{cart.count === 1 ? "" : "s"}
              </span>
            )}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={cart.close}
            className="rounded-full p-2 text-ink-500 hover:bg-ink-100"
            aria-label="Close cart"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {!cart.ready ? (
          <div className="flex-1 p-5 text-sm text-ink-400">Loading your cart…</div>
        ) : cart.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="text-ink-500">Your cart is empty.</p>
            <Link
              href="/search"
              onClick={cart.close}
              className="btn btn-primary px-5 py-2.5 text-sm"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          <>
            <FreeShippingBanner remainingCents={totals.freeShippingRemainingCents} />

            <ul className="flex-1 divide-y divide-ink-100 overflow-y-auto px-5">
              {cart.lines.map((line) => (
                <li key={line.product.id} className="flex gap-3 py-4">
                  <Link
                    href={`/product/${line.product.slug}`}
                    onClick={cart.close}
                    className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-ink-100"
                  >
                    <ProductImage product={line.product} sizes="80px" />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/product/${line.product.slug}`}
                      onClick={cart.close}
                      className="line-clamp-2 text-sm font-semibold text-ink-900 hover:text-brand-700"
                    >
                      {line.product.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {formatCents(line.product.priceCents)} each
                    </p>

                    <div className="mt-2 flex items-center gap-3">
                      <QuantityStepper
                        value={line.quantity}
                        max={Math.min(line.product.stock, 99)}
                        onChange={(next) => cart.setQuantity(line.product.id, next)}
                        label={line.product.name}
                      />
                      <button
                        type="button"
                        onClick={() => cart.remove(line.product.id)}
                        className="text-xs text-ink-400 underline hover:text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-900">
                    {formatCents(line.lineTotalCents)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="border-t border-ink-200 px-5 py-4">
              <dl className="space-y-1.5 text-sm">
                <SummaryRow label="Subtotal" value={formatCents(totals.subtotalCents)} />
                <SummaryRow
                  label="Delivery"
                  value={
                    totals.shippingCents === 0 ? "Free" : formatCents(totals.shippingCents)
                  }
                />
                <SummaryRow label="Estimated tax" value={formatCents(totals.taxCents)} />
                <div className="flex items-baseline justify-between border-t border-ink-200 pt-2 text-base font-bold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatCents(totals.totalCents)}</dd>
                </div>
              </dl>

              <p className="mt-2 text-xs text-ink-400">
                Free standard shipping over {formatCents(FREE_SHIPPING_THRESHOLD_CENTS)}.
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={cart.clear}
                  className="btn btn-ghost px-4 py-2.5 text-sm"
                >
                  Clear
                </button>
                <Link
                  href="/checkout"
                  onClick={cart.close}
                  className="btn btn-primary flex-1 px-4 py-2.5 text-sm"
                >
                  Checkout
                </Link>
              </div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function FreeShippingBanner({ remainingCents }: { remainingCents: number }) {
  if (remainingCents > 0) {
    return (
      <p className="border-b border-ink-200 bg-brand-900/40 px-5 py-2.5 text-xs text-brand-300">
        Add {formatCents(remainingCents)} more for free standard delivery.
      </p>
    );
  }
  return (
    <p className="border-b border-ink-100 bg-emerald-soft px-5 py-2.5 text-xs text-emerald-ink">
      You have earned free standard delivery.
    </p>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-ink-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

export function QuantityStepper({
  value,
  max,
  min = 1,
  onChange,
  label,
}: {
  value: number;
  max: number;
  min?: number;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-ink-200">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        className="grid h-7 w-7 place-items-center rounded-l-full text-ink-600 hover:bg-ink-100 disabled:opacity-40"
        aria-label={`Decrease quantity of ${label}`}
      >
        &minus;
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className="grid h-7 w-7 place-items-center rounded-r-full text-ink-600 hover:bg-ink-100 disabled:opacity-40"
        aria-label={`Increase quantity of ${label}`}
      >
        +
      </button>
    </div>
  );
}
