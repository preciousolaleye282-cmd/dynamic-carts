import { hasDatabase, query, queryOne } from "./db";
import { isPromotionLive, type Promotion } from "./promotions";

/**
 * Reading the live flash sale.
 *
 * The countdown needs three things and they must all come from the server:
 *   - `endsAt`   when the sale stops, so the timer cannot be client-authored
 *   - `serverNow` the instant the page was rendered, so the browser measures
 *                 drift instead of trusting its own (possibly wrong) clock
 *   - `active`   whether the window is open at all, so a past sale can show
 *                 "Sale ended" rather than counting up
 *
 * With no database the sale is still real, just derived: a rolling window that
 * ends at the next UTC midnight keeps the demo honest without any configuration.
 */

export type ActivePromotion = {
  promotion: Promotion | null;
  serverNow: number;
};

type PromotionRow = {
  id: string;
  slug: string;
  label: string;
  blurb: string | null;
  discount_pct: number | string;
  starts_at: string | Date;
  ends_at: string | Date;
};

/** pg returns TIMESTAMPTZ as a Date; normalise to an ISO string. */
function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRow(row: PromotionRow): Promotion {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    blurb: row.blurb,
    discountPct:
      typeof row.discount_pct === "number"
        ? row.discount_pct
        : Number.parseInt(row.discount_pct, 10),
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
  };
}

/**
 * The flash sale the banners and product pages should use right now.
 *
 * The most recently created live row wins, so overlapping seeds cannot produce
 * two countdowns fighting over the same corner of the page.
 */
export async function getActivePromotion(): Promise<ActivePromotion> {
  const serverNow = Date.now();

  if (!hasDatabase) {
    // Ends at the next UTC midnight: always in the future, never stale.
    const endsAt = new Date(serverNow);
    endsAt.setUTCHours(24, 0, 0, 0);
    return {
      serverNow,
      promotion: {
        id: "demo-flash-sale",
        slug: "flash-sale",
        label: "Flash sale",
        blurb: "Extra off already-reduced pieces",
        discountPct: 10,
        startsAt: new Date(serverNow).toISOString(),
        endsAt: endsAt.toISOString(),
      },
    };
  }

  try {
    const row = await queryOne<PromotionRow>(
      `SELECT id, slug, label, blurb, discount_pct, starts_at, ends_at
         FROM promotions
        WHERE active
          AND starts_at <= now()
          AND ends_at   >  now()
        ORDER BY ends_at ASC, created_at DESC
        LIMIT 1`,
    );

    if (!row) {
      // Nothing scheduled. Report an empty sale rather than inventing one, so
      // the banner honestly renders its "sale ended" state.
      return { serverNow, promotion: null };
    }

    const promotion = mapRow(row);
    // Defensive: if the row is somehow outside its own window, treat it as over
    // rather than showing a timer that already reads zero.
    if (!isPromotionLive(promotion, serverNow)) {
      return { serverNow, promotion: null };
    }
    return { serverNow, promotion };
  } catch (error) {
    console.error("[dynamic-carts] promotion lookup failed:", error);
    return { serverNow, promotion: null };
  }
}

/** All rows, newest first. Used by the "sale ends" copy on the sale listing. */
export async function getPromotions(): Promise<Promotion[]> {
  if (!hasDatabase) return [];
  try {
    const rows = await query<PromotionRow>(
      `SELECT id, slug, label, blurb, discount_pct, starts_at, ends_at
         FROM promotions
        ORDER BY created_at DESC`,
    );
    return rows.map(mapRow);
  } catch (error) {
    console.error("[dynamic-carts] promotions lookup failed:", error);
    return [];
  }
}