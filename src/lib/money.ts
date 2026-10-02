import type { ShippingMethod } from "./types";

/**
 * Money is stored in minor units (kobo for NGN) and only ever formatted through
 * `formatCents`, so changing currency never means touching a price anywhere.
 */
export const CURRENCY = "NGN";

/** Nigerian locale: gives the ₦ symbol and correct grouping. */
const LOCALE = "en-NG";

/** Minor units -> "₦1,234.56". Intl handles symbol, grouping and rounding. */
export function formatCents(cents: number, currency: string = CURRENCY): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Just the number, no symbol - for inputs and copy that adds "₦" itself. */
export function formatAmount(cents: number): string {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2 }).format(cents / 100);
}

/** Nigerian VAT. Keep it here so client and server agree. */
export const TAX_RATE = 0.075;

/** Orders at or above this subtotal ship free on the standard method (₦150,000). */
export const FREE_SHIPPING_THRESHOLD_CENTS = 15_000_000;

export const SHIPPING_METHODS: Record<
  ShippingMethod,
  { id: ShippingMethod; label: string; eta: string; priceCents: number }
> = {
  standard: {
    id: "standard",
    label: "Standard",
    eta: "4-6 business days",
    priceCents: 600_000,
  },
  express: {
    id: "express",
    label: "Express",
    eta: "2-3 business days",
    priceCents: 1_400_000,
  },
  overnight: {
    id: "overnight",
    label: "Overnight",
    eta: "Next business day",
    priceCents: 2_900_000,
  },
};

export const DEFAULT_SHIPPING_METHOD: ShippingMethod = "standard";

export function isShippingMethod(value: unknown): value is ShippingMethod {
  return value === "standard" || value === "express" || value === "overnight";
}

export type Totals = {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  freeShippingRemainingCents: number;
};

/**
 * The single source of truth for money arithmetic. Called by the client to
 * render the summary and by the server before the order row is written, so a
 * tampered client payload can never change what the customer is charged.
 */
export function computeTotals(
  items: { priceCents: number; quantity: number }[],
  shippingMethod: ShippingMethod = DEFAULT_SHIPPING_METHOD,
): Totals {
  const subtotalCents = items.reduce(
    (sum, item) => sum + item.priceCents * item.quantity,
    0,
  );

  const method = SHIPPING_METHODS[shippingMethod] ?? SHIPPING_METHODS.standard;
  const qualifiesForFreeShipping =
    shippingMethod === "standard" && subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS;
  const shippingCents = subtotalCents === 0 || qualifiesForFreeShipping ? 0 : method.priceCents;

  // Tax applies to goods + shipping (standard retail treatment).
  const taxCents = Math.round((subtotalCents + shippingCents) * TAX_RATE);
  const discountCents = 0;
  const totalCents = subtotalCents + shippingCents + taxCents - discountCents;

  return {
    subtotalCents,
    shippingCents,
    taxCents,
    discountCents,
    totalCents,
    freeShippingRemainingCents: Math.max(
      0,
      FREE_SHIPPING_THRESHOLD_CENTS - subtotalCents,
    ),
  };
}

export function discountPercent(
  priceCents: number,
  compareAtCents: number | null,
): number | null {
  if (!compareAtCents || compareAtCents <= priceCents) return null;
  return Math.round(((compareAtCents - priceCents) / compareAtCents) * 100);
}
