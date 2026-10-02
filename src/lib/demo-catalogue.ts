import catalogueJson from "../../data/catalogue.json";
import type { Category, Product } from "./types";

/**
 * The bundled catalogue, used when DATABASE_URL is not set (demo mode) and as
 * the source that `npm run db:seed` writes into Postgres. One file, one truth.
 *
 * The synthetic UUIDs are derived from the slug so that demo-mode ids stay
 * stable across requests and match what the seed script inserts.
 */

/**
 * Deterministic product variants.
 *
 * The catalogue is deliberately variant-free: one row per product, one price.
 * The design references show swatches and a size selector though, and shoppers
 * expect to pick a size. Rather than invent a schema (and a migration) for a
 * demo store, sizes and colours are derived from the slug - the same trick the
 * generated product artwork uses. The same product always gets the same options,
 * on the server and in the browser, with nothing stored.
 */

const COLOURWAYS = [
  { name: "Onyx", hex: "#1c1c20" },
  { name: "Bone", hex: "#e8e3d9" },
  { name: "Rust", hex: "#b5541f" },
  { name: "Slate", hex: "#5b6470" },
  { name: "Moss", hex: "#4a5b43" },
  { name: "Clay", hex: "#a9714b" },
] as const;

const APPAREL_SIZES = ["XS", "S", "M", "L", "XL"];
const SHOE_SIZES = ["38", "39", "40", "41", "42"];
const ONE_SIZE = ["One size"];

/** FNV-1a, so the result is stable across restarts and deployments. */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export type Variant = { name: string; hex: string };

/** Two to four colourways per product, chosen by slug hash. */
export function colourwaysFor(slug: string): Variant[] {
  const seed = hash(slug);
  const count = 2 + (seed % 3); // 2, 3 or 4
  // `>>>` (unsigned), not `>>`: `hash` can exceed 2^31, and a signed shift would
  // go negative and index off the front of the array.
  const start = (seed >>> 5) % COLOURWAYS.length;
  const out: Variant[] = [];
  for (let i = 0; i < count; i += 1) {
    const colour = COLOURWAYS[(start + i) % COLOURWAYS.length];
    if (colour && !out.some((c) => c.name === colour.name)) out.push({ ...colour });
  }
  return out;
}

/** Size run appropriate to the category. Footwear uses EU sizing. */
export function sizesFor(slug: string, categorySlug: string | null): string[] {
  if (categorySlug === "footwear") return SHOE_SIZES;
  if (categorySlug === "accessories") return ONE_SIZE;
  const seed = hash(`${slug}:size`);
  const count = 3 + (seed % 3); // 3, 4 or 5
  const start = seed % APPAREL_SIZES.length;
  return Array.from({ length: count }, (_, i) => APPAREL_SIZES[(start + i) % APPAREL_SIZES.length]);
}

/**
 * Which sizes are actually orderable. Derived rather than random so the list
 * always looks like real stock: a couple of end sizes sell out, the middle ones
 * never do.
 */
export function availableSizesFor(slug: string, categorySlug: string | null): Set<string> {
  const sizes = sizesFor(slug, categorySlug);
  const seed = hash(`${slug}:avail`);
  const soldOut = new Set<string>();
  if (sizes.length > 2) soldOut.add(sizes[0]);
  soldOut.add(sizes[sizes.length - 1]);
  // Occasionally a middle size sells out too, which is what makes a size run
  // look like a real one rather than a uniform block.
  if (seed % 3 === 0 && sizes.length > 3) soldOut.add(sizes[Math.floor(sizes.length / 2)]);
  return new Set(sizes.filter((size) => !soldOut.has(size)));
}

type RawCategory = {
  slug: string;
  name: string;
  glyph: string;
  accent: string;
  blurb: string;
  sort_order: number;
};

type RawProduct = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price_cents: number;
  compare_at_cents: number | null;
  category: string;
  rating: number;
  review_count: number;
  stock: number;
  is_featured: boolean;
  sort_order: number;
  /** Set by `npm run images` once real photography has been downloaded. */
  image_url?: string | null;
};

const raw = catalogueJson as unknown as {
  categories: RawCategory[];
  products: RawProduct[];
};

/**
 * Deterministic UUID v4-shaped string from a slug (FNV-1a). Not a real UUID
 * generator - it only needs to be stable, collision-free across ~12 rows and
 * shaped like a UUID so nothing downstream has to special-case demo mode.
 */
export function pseudoUuid(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i += 1) {
    h1 ^= seed.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 ^ seed.charCodeAt(i), 0x85ebca6b) >>> 0) ^ (i + 1);
  }
  const hex = (n: number, len: number) =>
    (n >>> 0).toString(16).padStart(len, "0").slice(-len);
  const a = hex(h1, 8);
  const b = hex(h2, 4);
  const c = hex(h1 ^ h2, 4);
  const d = hex(Math.imul(h1, 7) ^ 0x9e3779b9, 4);
  const e = hex((h1 + h2 + seed.length) >>> 0, 12);
  return `${a}-${b}-${c}-${d}-${e}`;
}

export const demoCategories: Category[] = raw.categories
  .map((category) => ({
    id: pseudoUuid(`category:${category.slug}`),
    slug: category.slug,
    name: category.name,
    glyph: category.glyph,
    accent: category.accent,
    blurb: category.blurb,
    sortOrder: category.sort_order,
  }))
  .sort((a, b) => a.sortOrder - b.sortOrder);

const categoryBySlug = new Map(demoCategories.map((c) => [c.slug, c]));

export const demoProducts: Product[] = raw.products
  .map((product) => {
    const category = categoryBySlug.get(product.category) ?? null;
    return {
      id: pseudoUuid(`product:${product.slug}`),
      slug: product.slug,
      name: product.name,
      tagline: product.tagline,
      description: product.description,
      priceCents: product.price_cents,
      compareAtCents: product.compare_at_cents,
      imageUrl: product.image_url ?? null,
      categoryId: category?.id ?? null,
      categorySlug: category?.slug ?? null,
      categoryName: category?.name ?? null,
      rating: product.rating,
      reviewCount: product.review_count,
      stock: product.stock,
      isFeatured: product.is_featured,
      sortOrder: product.sort_order,
    };
  })
  .sort((a, b) => a.sortOrder - b.sortOrder);

const productBySlug = new Map(demoProducts.map((p) => [p.slug, p]));
const productById = new Map(demoProducts.map((p) => [p.id, p]));

export const demoProductBySlug = (slug: string): Product | null =>
  productBySlug.get(slug) ?? null;

export const demoProductById = (id: string): Product | null =>
  productById.get(id) ?? null;

export const demoCategoryBySlug = (slug: string): Category | null =>
  demoCategories.find((c) => c.slug === slug) ?? null;
