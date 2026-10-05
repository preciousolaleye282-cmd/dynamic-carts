import type { Product } from "./types";

/**
 * Sale pricing.
 *
 * The flash sale is a *percentage* applied on top of whatever markdown a product
 * already carries, so the same rule can run on the server (before an order is
 * written) and in the browser (to draw a card) without the two ever disagreeing.
 *
 * Everything here is pure and takes `now` as an argument rather than reading the
 * clock. That is deliberate: the countdown passes the server's time down, so a
 * device with a wrong clock renders the same prices as everybody else, and a
 * test can pin `now` to prove the boundary behaves.
 */

export type Promotion = {
  id: string;
  slug: string;
  label: string;
  blurb: string | null;
  discountPct: number;
  startsAt: string;
  endsAt: string;
};

/** How long a checkout holds stock before releasing it. */
export const RESERVATION_MINUTES = 10;

/** A promotion is live only between its start and end instants. */
export function isPromotionLive(
  promotion: Pick<Promotion, "startsAt" | "endsAt">,
  now: number,
): boolean {
  const start = Date.parse(promotion.startsAt);
  const end = Date.parse(promotion.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return now >= start && now < end;
}

/** Round to whole minor units. Money is never fractional. */
function roundCents(value: number): number {
  return Math.round(value);
}

/**
 * The price a product should be *shown* and *charged* at.
 *
 * Only items that already carry a `compareAtCents` markdown are discounted -
 * a product with no "was" price has nothing for a sale to come off. That also
 * means the flash-sale listing is exactly "items with a markdown", which is what
 * the promo banner promises when it links to the sale.
 */
export function salePriceFor(
  product: Pick<Product, "priceCents" | "compareAtCents">,
  promotion: Pick<Promotion, "discountPct" | "startsAt" | "endsAt"> | null,
  now: number,
): { priceCents: number; compareAtCents: number | null } {
  if (!promotion || !isPromotionLive(promotion, now)) {
    return { priceCents: product.priceCents, compareAtCents: product.compareAtCents };
  }
  if (!product.compareAtCents || product.compareAtCents <= product.priceCents) {
    return { priceCents: product.priceCents, compareAtCents: product.compareAtCents };
  }

  const factor = 1 - promotion.discountPct / 100;
  const sale = roundCents(product.priceCents * factor);

  // Never below zero, and never *above* the marked-down price.
  const priceCents = Math.max(0, Math.min(sale, product.priceCents));
  return { priceCents, compareAtCents: product.compareAtCents };
}

/** True when the sale is actually changing this product's price. */
export function isOnFlashSale(
  product: Pick<Product, "priceCents" | "compareAtCents">,
  promotion: Pick<Promotion, "discountPct" | "startsAt" | "endsAt"> | null,
  now: number,
): boolean {
  const base = { priceCents: product.priceCents, compareAtCents: product.compareAtCents };
  return salePriceFor(base, promotion, now).priceCents < base.priceCents;
}

/**
 * Split `HH:MM:SS` for the countdown. Negative input clamps to zero so the
 * banner can render its "sale ended" state from the same call.
 */
export function splitDuration(totalSeconds: number): {
  hours: number;
  minutes: number;
  seconds: number;
  ended: boolean;
} {
  const safe = Math.max(0, Math.floor(totalSeconds));
  return {
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
    ended: safe <= 0,
  };
}

export function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}