"use client";

import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { useShopper } from "@/lib/cart";
import type { Product } from "@/lib/types";

/**
 * The wishlist.
 *
 * The saved ids live in localStorage, so this is a client component that reads
 * them after mount and resolves them against the catalogue the layout already
 * loaded into the cart context. Rendering nothing until `ready` avoids a
 * hydration mismatch.
 */
export function WishlistView({ catalogue }: { catalogue: Product[] }) {
  const { wishlist, ready, clearWishlist } = useShopper();

  if (!ready) {
    return <p className="py-16 text-center text-sm text-ink-500">Loading your wishlist…</p>;
  }

  const byId = new Map(catalogue.map((p) => [p.id, p]));
  const products = wishlist
    .map((id) => byId.get(id))
    .filter((p): p is Product => Boolean(p));

  if (products.length === 0) {
    return (
      <div className="card-surface px-6 py-20 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-500/10 text-brand-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
            <path
              d="M12 20.5 4.8 13.3a4.6 4.6 0 0 1 6.5-6.5l.7.7.7-.7a4.6 4.6 0 0 1 6.5 6.5Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h2 className="mt-5 text-lg font-semibold text-ink-900">Nothing saved yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
          Tap the heart on any product to keep it here. Your wishlist stays in this
          browser - no account needed.
        </p>
        <Link href="/search" className="btn btn-primary mt-6 px-6 py-3 text-sm">
          Start browsing
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-ink-500">
          {products.length} saved item{products.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={clearWishlist}
          className="text-sm text-ink-500 underline-offset-4 transition hover:text-brand-500 hover:underline"
        >
          Clear wishlist
        </button>
      </div>

      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </div>
  );
}