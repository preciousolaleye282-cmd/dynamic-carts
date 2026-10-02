"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { discountPercent, formatCents } from "@/lib/money";
import type { Product } from "@/lib/types";
import { ProductImage } from "./product-image";
import { Stars } from "./stars";
import { WishlistButton } from "./wishlist-button";
import { colourwaysFor } from "@/lib/demo-catalogue";

/**
 * The product card from the sketch: artwork on top, then name, rating, price and
 * a round "add to cart" button that flashes once the item is in the basket.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  product: Product;
  priority?: boolean;
}) {
  const cart = useCart();
  const discount = discountPercent(product.priceCents, product.compareAtCents);
  const soldOut = product.stock < 1;
  const justAdded = cart.justAdded === product.id;

  return (
    <article className="card-surface group relative flex flex-col overflow-hidden transition hover:border-ink-500 hover:shadow-sm">
      <Link
        href={`/product/${product.slug}`}
        className="relative block aspect-square overflow-hidden bg-ink-100"
      >
        <ProductImage
          product={product}
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="transition duration-300 group-hover:scale-105"
        />

        {discount !== null && (
          <span className="absolute left-3 top-3 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-bold text-white">
            -{discount}%
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-ink-900/80 py-1.5 text-center text-xs font-semibold text-white">
            Sold out
          </span>
        )}
        {!soldOut && product.stock <= 5 && (
          <span className="absolute right-3 top-3 rounded-full bg-ink-900/90 px-2.5 py-1 text-[11px] font-semibold text-amber-ink">
            Only {product.stock} left
          </span>
        )}
      </Link>

      {/* Wishlist sits above the image, so it is positioned outside the link.
          It fades in on hover so the resting card stays calm. */}
      <div className="absolute right-3 top-3 z-10 opacity-0 transition duration-200 focus-within:opacity-100 group-hover:opacity-100">
        <WishlistButton
          productId={product.id}
          name={product.name}
          className="btn-invert h-9 w-9 backdrop-blur"
        />
      </div>

      <div className="flex flex-1 flex-col p-4">
        {product.categoryName && (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            {product.categoryName}
          </p>
        )}

        <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-ink-900">
          <Link href={`/product/${product.slug}`} className="hover:text-brand-700">
            {product.name}
          </Link>
        </h3>

        <Stars rating={product.rating} reviewCount={product.reviewCount} />

        {/* Colourway dots, as on the reference cards. Purely indicative: the
            catalogue is one row per product, so they link rather than switch. */}
        <ul className="mt-2 flex items-center gap-1.5" aria-label="Available colours">
          {colourwaysFor(product.slug).map((colour) => (
            <li key={colour.name}>
              <Link
                href={`/product/${product.slug}`}
                title={colour.name}
                className="block h-3.5 w-3.5 rounded-full ring-1 ring-ink-300 transition hover:ring-ink-500"
                style={{ backgroundColor: colour.hex }}
              >
                <span className="sr-only">{colour.name}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <p className="leading-tight">
            <span className="text-base font-bold text-ink-900">
              {formatCents(product.priceCents)}
            </span>
            {product.compareAtCents !== null &&
              product.compareAtCents > product.priceCents && (
                <span className="ml-1.5 text-xs text-ink-400 line-through">
                  {formatCents(product.compareAtCents)}
                </span>
              )}
          </p>

          <button
            type="button"
            onClick={() => cart.add(product.id)}
            disabled={soldOut}
            className={`btn btn-invert h-9 w-9 shrink-0 rounded-full p-0 ${
              justAdded ? "btn-primary" : ""
            }`}
            aria-label={
              soldOut ? `${product.name} is sold out` : `Add ${product.name} to cart`
            }
            title={soldOut ? "Sold out" : "Add to cart"}
          >
            {justAdded ? (
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="m4 10.5 4 4 8-9"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M10 4v12M4 10h12"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
