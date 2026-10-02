"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart, useShopper } from "@/lib/cart";
import { availableSizesFor, sizesFor } from "@/lib/demo-catalogue";
import type { Product } from "@/lib/types";
import { QuantityStepper } from "./cart-drawer";
import { WishlistButton } from "./wishlist-button";

/**
 * The product page's buy box: size run, quantity, add-to-cart, wishlist and the
 * two things a shopper wants next.
 *
 * Sizes are derived (see demo-catalogue) rather than stored, so this picks the
 * first orderable size as the default and refuses to add an unavailable one.
 * `?size=` in the URL pre-selects, which is how the hero hands its choice over.
 */
export function AddToCart({ product }: { product: Product }) {
  const cart = useCart();
  const shopper = useShopper();
  const router = useRouter();
  const params = useSearchParams();

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const sizes = sizesFor(product.slug, product.categorySlug);
  const available = availableSizesFor(product.slug, product.categorySlug);

  const requested = params.get("size");
  const defaultSize = sizes.find((s) => available.has(s)) ?? null;
  const [chosen, setChosen] = useState<string | null>(defaultSize);

  useEffect(() => {
    if (requested && available.has(requested)) setChosen(requested);
  }, [requested, available]);

  // Record the view for the "recently viewed" strip.
  useEffect(() => {
    if (shopper.ready) shopper.trackView(product.id);
    // Intentionally once per product: re-running on every render would be a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, shopper.ready]);

  const soldOut = product.stock < 1;
  const max = Math.min(product.stock, 99);
  const sizeUnavailable = sizes.length > 1 && chosen !== null && !available.has(chosen);

  const add = () => {
    if (sizeUnavailable) return;
    cart.add(product.id, quantity);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="space-y-4">
      {sizes.length > 1 && (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-ink-900">Choose your size</p>
            {chosen && (
              <p className="text-xs text-ink-500">Selected: {chosen}</p>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {sizes.map((size) => {
              const inStock = available.has(size);
              const isActive = size === chosen;
              return (
                <button
                  key={size}
                  type="button"
                  disabled={!inStock || soldOut}
                  onClick={() => setChosen(size)}
                  aria-pressed={isActive}
                  title={inStock ? `Size ${size}` : `Size ${size} - sold out`}
                  className={`min-w-12 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                    !inStock
                      ? "cursor-not-allowed border-ink-200 text-ink-500 line-through"
                      : isActive
                        ? "border-brand-500 bg-brand-600 text-white"
                        : "border-ink-200 text-ink-700 hover:border-ink-400"
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
          {sizeUnavailable && (
            <p className="mt-2 text-sm text-amber-ink">
              That size has sold out - pick another one.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <QuantityStepper
          value={quantity}
          max={max}
          onChange={setQuantity}
          label={product.name}
        />
        <button
          type="button"
          onClick={add}
          disabled={soldOut || sizeUnavailable}
          className="btn btn-primary flex-1 px-6 py-3 text-sm"
        >
          {soldOut ? "Sold out" : added ? "Added to cart" : "Add to cart"}
        </button>
        <WishlistButton
          productId={product.id}
          name={product.name}
          className="h-11 w-11 shrink-0 border border-ink-200 text-ink-600 hover:border-brand-500 hover:text-brand-500"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={cart.open}
          className="btn btn-ghost px-4 py-2.5 text-sm"
        >
          View cart
        </button>
        <button
          type="button"
          onClick={() => {
            add();
            router.push("/checkout");
          }}
          disabled={soldOut || sizeUnavailable}
          className="btn btn-ghost px-4 py-2.5 text-sm"
        >
          Buy now
        </button>
      </div>

      {product.stock > 0 && product.stock <= 10 && (
        <p className="text-sm font-medium text-amber-ink">
          Only {product.stock} left in stock.
        </p>
      )}
    </div>
  );
}
