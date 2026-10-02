"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Stars } from "@/components/stars";
import { availableSizesFor, colourwaysFor, sizesFor } from "@/lib/demo-catalogue";
import { discountPercent, formatCents } from "@/lib/money";
import type { Product } from "@/lib/types";

/**
 * The immersive product hero.
 *
 * Follows the hero reference: a saturated full-bleed wash, a floating rounded
 * panel, the product dead centre, the headline on the left and the price with a
 * size run on the right. Carousel dots cycle the featured set, and the size
 * selector is real - sizes that are out of stock are disabled and struck
 * through. The chosen size is carried into the product page via the URL so the
 * add-to-bag form starts on a valid variant.
 */

export type HeroSlide = {
  product: Product;
  eyebrow: string;
  headline: string;
  blurb: string;
};

export function ProductHero({
  slides,
  stats,
}: {
  slides: HeroSlide[];
  stats: { products: number; reviews: number; averageRating: number };
}) {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const active = slides[index];

  const sizes = useMemo(
    () => (active ? sizesFor(active.product.slug, active.product.categorySlug) : []),
    [active],
  );
  const available = useMemo(
    () =>
      active ? availableSizesFor(active.product.slug, active.product.categorySlug) : new Set<string>(),
    [active],
  );
  const colours = useMemo(() => (active ? colourwaysFor(active.product.slug) : []), [active]);

  // Default to the first orderable size so the CTA is never a dead link, and so
  // switching slides cannot leave a size selected that this product does not have.
  const selectedSize =
    chosen && available.has(chosen) ? chosen : (sizes.find((s) => available.has(s)) ?? null);

  if (!active) return null;

  const discount = discountPercent(active.product.priceCents, active.product.compareAtCents);
  const soldOut = active.product.stock < 1;
  const href = `/product/${active.product.slug}${
    selectedSize ? `?size=${encodeURIComponent(selectedSize)}` : ""
  }`;

  return (
    <section className="relative overflow-hidden rounded-card">
      {/* Saturated wash, brightest top-left, deepening into the panel. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(140deg,#ff8a3d_0%,#ff5c1f_38%,#d93d0c_72%,#8f2205_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70 mix-blend-soft-light bg-[radial-gradient(60%_70%_at_20%_10%,#ffd9a8,transparent_60%),radial-gradient(50%_60%_at_85%_90%,#5a1002,transparent_65%)]"
      />

      <div className="relative m-3 rounded-[2rem] border border-white/15 bg-black/25 p-5 backdrop-blur-md sm:m-4 sm:p-8 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr_0.85fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full border border-white/25 bg-black/25 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/90">
              {active.eyebrow}
            </span>

            <h1 className="mt-4 text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-5xl">
              {active.headline}
            </h1>

            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/80">{active.blurb}</p>

            <div className="mt-6 flex items-center gap-3">
              <Link
                href={href}
                className="btn bg-white px-6 py-3 text-sm font-bold text-black transition hover:bg-ink-100 hover:text-white"
              >
                Get the look →
              </Link>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/85">
                <Stars rating={stats.averageRating} />
                {stats.reviews.toLocaleString("en-US")}
              </span>
            </div>
          </div>
          <Link href={`/product/${active.product.slug}`} className="group order-first lg:order-none">
            <div className="mx-auto flex aspect-square w-full max-w-sm items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={active.product.imageUrl ?? `/api/product-image/${active.product.slug}`}
                alt={active.product.name}
                width={520}
                height={520}
                className="h-full w-full object-contain drop-shadow-2xl transition duration-500 group-hover:scale-[1.03]"
              />
            </div>
          </Link>
          <div className="lg:pl-4">
            <p className="text-sm text-white/75">
              <span className="text-2xl font-bold text-white">
                {formatCents(active.product.priceCents)}
              </span>
              {active.product.compareAtCents !== null &&
                active.product.compareAtCents > active.product.priceCents && (
                  <span className="ml-2 line-through opacity-70">
                    {formatCents(active.product.compareAtCents)}
                  </span>
                )}
            </p>
            {discount !== null && (
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-white/90">
                Save {discount}%
              </p>
            )}

            {colours.length > 1 && (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.18em] text-white/70">Colour</p>
                <div className="mt-2 flex gap-2">
                  {colours.map((colour) => (
                    <span
                      key={colour.name}
                      title={colour.name}
                      className="h-7 w-7 rounded-full ring-2 ring-white/40"
                      style={{ backgroundColor: colour.hex }}
                    />
                  ))}
                </div>
              </div>
            )}

            {sizes.length > 1 && (
              <div className="mt-5">
                <p className="text-xs uppercase tracking-[0.18em] text-white/70">
                  Choose your size
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sizes.map((size) => {
                    const inStock = available.has(size);
                    const isActive = size === selectedSize;
                    return (
                      <button
                        key={size}
                        type="button"
                        disabled={!inStock || soldOut}
                        onClick={() => setChosen(size)}
                        aria-pressed={isActive}
                        title={inStock ? `Size ${size}` : `Size ${size} - sold out`}
                        className={`min-w-11 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                          !inStock
                            ? "cursor-not-allowed bg-black/25 text-white/35 line-through"
                            : isActive
                              ? "bg-white text-black"
                              : "bg-black/30 text-white hover:bg-black/45"
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="mt-5 text-xs text-white/70">
              {soldOut
                ? "Currently sold out"
                : active.product.stock <= 5
                  ? `Only ${active.product.stock} left in stock`
                  : "In stock, ships within 48 hours"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {slides.map((slide, i) => (
              <button
                key={slide.product.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show ${slide.product.name}`}
                aria-current={i === index}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-6 bg-white" : "w-2 bg-white/45 hover:bg-white/70"
                }`}
              />
            ))}
          </div>

          <div className="hidden items-center gap-4 text-white/70 sm:flex">
            {["Instagram", "Facebook", "Pinterest"].map((label) => (
              <span key={label} className="text-xs font-medium">
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="pb-4 pt-3 text-center text-sm font-medium text-white/90">
        Confidence, wrapped in warmth.
      </p>
    </section>
  );
}