import { query, queryOne, hasDatabase } from "./db";
import { pseudoUuid } from "./demo-catalogue";
import { getProductsByIds } from "./queries";
import type { Address, CartLine, Profile, SessionUser } from "./types";

/**
 * Customer records and the server-side cart.
 *
 * A profile is created the first time someone completes Google sign-in. The
 * `google_sub` claim - not the email - is the identity key, because a Google
 * account's email address can change but `sub` never does.
 */

// ---------------------------------------------------------------------------
// Demo-mode stores. In-memory only: they reset when the dev server restarts,
// which is exactly the behaviour you want before a real database exists.
// ---------------------------------------------------------------------------

type DemoProfile = Profile & { googleSub: string };
type DemoStore = {
  profiles: Map<string, DemoProfile>;
  carts: Map<string, Map<string, number>>; // profileId -> productId -> quantity
  wishlists: Map<string, Set<string>>; // profileId -> productId set
};

declare global {
  var __dynamicCartsDemoStore: DemoStore | undefined;
}

function demoStore(): DemoStore {
  if (!globalThis.__dynamicCartsDemoStore) {
    globalThis.__dynamicCartsDemoStore = { profiles: new Map(), carts: new Map(), wishlists: new Map() };
  }
  return globalThis.__dynamicCartsDemoStore;
}

function emptyAddress(value: unknown): Address | null {
  if (value === null || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.fullName !== "string" || typeof raw.line1 !== "string") return null;
  return {
    fullName: raw.fullName,
    line1: raw.line1,
    line2: typeof raw.line2 === "string" ? raw.line2 : null,
    city: typeof raw.city === "string" ? raw.city : "",
    postcode: typeof raw.postcode === "string" ? raw.postcode : "",
    country: typeof raw.country === "string" ? raw.country : "",
    phone: typeof raw.phone === "string" ? raw.phone : "",
  };
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

type ProfileRow = {
  id: string;
  google_sub: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  default_address: unknown;
};

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    defaultAddress: emptyAddress(row.default_address),
  };
}

const PROFILE_COLUMNS =
  "id, google_sub, email, full_name, avatar_url, default_address";

export async function getProfileBySub(sub: string): Promise<Profile | null> {
  if (!hasDatabase) return demoStore().profiles.get(sub) ?? null;
  const row = await queryOne<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE google_sub = $1`,
    [sub],
  );
  return row ? mapProfile(row) : null;
}

export async function getProfileById(id: string): Promise<Profile | null> {
  if (!hasDatabase) {
    for (const profile of demoStore().profiles.values()) {
      if (profile.id === id) return profile;
    }
    return null;
  }
  const row = await queryOne<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE id = $1`,
    [id],
  );
  return row ? mapProfile(row) : null;
}

/**
 * Insert-or-update on first sign-in and on every sign-in after. Name and
 * avatar are refreshed from Google; `default_address` is deliberately left
 * alone so a customer's saved delivery address survives a profile edit.
 */
export async function upsertProfile(
  user: SessionUser,
  defaultAddress?: Address,
): Promise<Profile | null> {
  if (!hasDatabase) {
    const store = demoStore();
    const existing = store.profiles.get(user.sub);
    const profile: DemoProfile = {
      id: existing?.id ?? pseudoUuid(`profile:${user.sub}`),
      googleSub: user.sub,
      email: user.email,
      fullName: user.name ?? existing?.fullName ?? null,
      avatarUrl: user.picture ?? existing?.avatarUrl ?? null,
      defaultAddress: defaultAddress ?? existing?.defaultAddress ?? null,
    };
    store.profiles.set(user.sub, profile);
    return profile;
  }

  const row = await queryOne<ProfileRow>(
    `INSERT INTO profiles (google_sub, email, full_name, avatar_url, default_address)
          VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (google_sub) DO UPDATE SET
          email            = EXCLUDED.email,
          full_name        = COALESCE(EXCLUDED.full_name, profiles.full_name),
          avatar_url       = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
          default_address  = COALESCE(EXCLUDED.default_address, profiles.default_address)
     RETURNING ${PROFILE_COLUMNS}`,
    [
      user.sub,
      user.email,
      user.name,
      user.picture,
      defaultAddress ? JSON.stringify(defaultAddress) : null,
    ],
  );
  return row ? mapProfile(row) : null;
}

export async function saveDefaultAddress(
  userId: string,
  address: Address,
): Promise<void> {
  if (!hasDatabase) {
    for (const [sub, profile] of demoStore().profiles) {
      if (profile.id === userId) {
        demoStore().profiles.set(sub, { ...profile, defaultAddress: address });
      }
    }
    return;
  }
  await query(`UPDATE profiles SET default_address = $2 WHERE id = $1`, [
    userId,
    JSON.stringify(address),
  ]);
}


// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export type { CartLine };

/**
 * The signed-in user's cart, hydrated with product details. Quantities are
 * clamped to available stock so a cart can never promise something that is
 * not actually there.
 */
export async function getCart(userId: string): Promise<CartLine[]> {
  const quantities = await getCartQuantities(userId);
  const ids = [...quantities.keys()];
  if (ids.length === 0) return [];

  const products = await getProductsByIds(ids);

  const lines: CartLine[] = [];
  for (const product of products) {
    const quantity = Math.min(quantities.get(product.id) ?? 0, product.stock);
    if (quantity <= 0) continue;
    lines.push({ product, quantity, lineTotalCents: product.priceCents * quantity });
  }
  return lines;
}

export async function getCartQuantities(userId: string): Promise<Map<string, number>> {
  if (!hasDatabase) {
    return new Map(demoStore().carts.get(userId) ?? new Map());
  }
  const rows = await query<{ product_id: string; quantity: number }>(
    `SELECT product_id, quantity FROM cart_items WHERE user_id = $1`,
    [userId],
  );
  return new Map(rows.map((row) => [row.product_id, row.quantity]));
}

/** quantity <= 0 removes the line. */
export async function setCartItem(
  userId: string,
  productId: string,
  quantity: number,
): Promise<void> {
  if (!hasDatabase) {
    const cart = demoStore().carts.get(userId) ?? new Map<string, number>();
    if (quantity <= 0) cart.delete(productId);
    else cart.set(productId, Math.min(quantity, 99));
    demoStore().carts.set(userId, cart);
    return;
  }
  if (quantity <= 0) {
    await query(`DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2`, [
      userId,
      productId,
    ]);
    return;
  }
  await query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
          VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    [userId, productId, Math.min(quantity, 99)],
  );
}

export async function clearCart(userId: string): Promise<void> {
  if (!hasDatabase) {
    demoStore().carts.delete(userId);
    return;
  }
  await query(`DELETE FROM cart_items WHERE user_id = $1`, [userId]);
}

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------

export async function getWishlistIds(userId: string): Promise<string[]> {
  if (!hasDatabase) {
    return [...(demoStore().wishlists.get(userId) ?? new Set<string>())];
  }
  const rows = await query<{ product_id: string }>(
    `SELECT product_id FROM wishlist_items WHERE user_id = $1`,
    [userId],
  );
  return rows.map((row) => row.product_id);
}

/** Replace the server wishlist with exactly this set of product ids. */
export async function setWishlistIds(userId: string, productIds: string[]): Promise<void> {
  if (!hasDatabase) {
    demoStore().wishlists.set(userId, new Set(productIds));
    return;
  }
  if (productIds.length === 0) {
    await query(`DELETE FROM wishlist_items WHERE user_id = $1`, [userId]);
    return;
  }
  const placeholders = productIds.map((_, i) => `($1, $${i + 2})`).join(", ");
  await query(
    `DELETE FROM wishlist_items WHERE user_id = $1 AND product_id <> ALL ($2::uuid[])`,
    [userId, productIds],
  );
  await query(
    `INSERT INTO wishlist_items (user_id, product_id) VALUES ${placeholders}
     ON CONFLICT DO NOTHING`,
    [userId, ...productIds],
  );
}

/**
 * Fold a guest's localStorage wishlist into their account wishlist after
 * sign-in. A wishlist is a set, so merging is a union - idempotent by nature.
 */
export async function mergeWishlist(userId: string, productIds: string[]): Promise<string[]> {
  const current = new Set(await getWishlistIds(userId));
  for (const id of productIds) current.add(id);
  const merged = [...current];
  await setWishlistIds(userId, merged);
  return merged;
}

/**
 * Fold a guest's localStorage cart into their account cart after sign-in.
 * Quantities add together and are capped, so merging twice cannot double up.
 */
export async function mergeCart(
  userId: string,
  items: { productId: string; quantity: number }[],
): Promise<CartLine[]> {
  for (const item of items) {
    const current = await getCartQuantities(userId);
    const next = Math.min((current.get(item.productId) ?? 0) + item.quantity, 99);
    await setCartItem(userId, item.productId, next);
  }
  return getCart(userId);
}
