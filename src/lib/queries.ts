import { query, queryOne, hasDatabase } from "./db";
import {
  demoCategories,
  demoProducts,
  demoProductById,
  demoProductBySlug,
  colourwaysFor,
  sizesFor,
} from "./demo-catalogue";
import type { Category, Product } from "./types";

/**
 * Catalogue reads. Every function has a demo-mode branch so the site renders
 * before a database exists, which keeps `npm run dev` useful immediately.
 */

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  price_cents: number | string;
  compare_at_cents: number | string | null;
  image_url: string | null;
  category_id: string | null;
  category_slug?: string | null;
  category_name?: string | null;
  rating: number | string;
  review_count: number | string;
  stock: number | string;
  is_featured: boolean;
  sort_order: number | string;
};

const PRODUCT_COLUMNS = `
  p.id, p.slug, p.name, p.tagline, p.description,
  p.price_cents, p.compare_at_cents, p.image_url, p.category_id,
  c.slug AS category_slug, c.name AS category_name,
  p.rating, p.review_count, p.stock, p.is_featured, p.sort_order
`;

/** pg returns NUMERIC as a string; normalise once, here. */
const toInt = (value: number | string | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number.parseInt(value, 10);
};

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    priceCents: toInt(row.price_cents),
    compareAtCents: row.compare_at_cents === null ? null : toInt(row.compare_at_cents),
    imageUrl: row.image_url,
    categoryId: row.category_id,
    categorySlug: row.category_slug ?? null,
    categoryName: row.category_name ?? null,
    rating: Number(row.rating),
    reviewCount: toInt(row.review_count),
    stock: toInt(row.stock),
    isFeatured: row.is_featured,
    sortOrder: toInt(row.sort_order),
  };
}

type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  glyph: string;
  accent: string;
  blurb: string | null;
  sort_order: number | string;
};

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    glyph: row.glyph,
    accent: row.accent,
    blurb: row.blurb,
    sortOrder: toInt(row.sort_order),
  };
}

export async function getCategories(): Promise<Category[]> {
  if (!hasDatabase) return demoCategories;
  const rows = await query<CategoryRow>(
    `SELECT id, slug, name, glyph, accent, blurb, sort_order
       FROM categories
      ORDER BY sort_order ASC, name ASC`,
  );
  return rows.map(mapCategory);
}

export async function getFeaturedProducts(limit = 12): Promise<Product[]> {
  if (!hasDatabase) return demoProducts.filter((p) => p.isFeatured).slice(0, limit);
  const rows = await query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_featured
      ORDER BY p.sort_order ASC
      LIMIT $1`,
    [limit],
  );
  return rows.map(mapProduct);
}


export type ProductSort = "featured" | "price-asc" | "price-desc" | "rating" | "newest";

export type ProductFilter = {
  categorySlug?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
  sort?: ProductSort;
  /** Only items carrying a markdown (what the flash sale applies to). */
  discountedOnly?: boolean;
  /** Restrict to products offered in at least one of these sizes. */
  sizes?: string[];
  /** Restrict to products offered in at least one of these colours. */
  colours?: string[];
  minPriceCents?: number | null;
  maxPriceCents?: number | null;
};

const ORDER_BY: Record<ProductSort, string> = {
  featured: "p.is_featured DESC, p.sort_order ASC",
  "price-asc": "p.price_cents ASC",
  "price-desc": "p.price_cents DESC",
  rating: "p.rating DESC, p.review_count DESC",
  newest: "p.created_at DESC",
};

/**
 * The demo-mode equivalent of ORDER_BY. Each branch must match the SQL above so
 * that switching on a database does not reorder the catalogue under the user.
 */
function sortDemoProducts(items: Product[], sort: ProductSort): Product[] {
  const sorted = [...items];
  switch (sort) {
    case "price-asc":
      return sorted.sort((a, b) => a.priceCents - b.priceCents);
    case "price-desc":
      return sorted.sort((a, b) => b.priceCents - a.priceCents);
    case "rating":
      return sorted.sort(
        (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
      );
    case "newest":
      // The bundled catalogue has no created_at, so "newest" falls back to the
      // curated sort_order - which is how the seed data is authored.
      return sorted.sort((a, b) => b.sortOrder - a.sortOrder);
    case "featured":
    default:
      return sorted.sort(
        (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.sortOrder - b.sortOrder,
      );
  }
}

export async function getProducts(filter: ProductFilter = {}): Promise<Product[]> {
  const {
    categorySlug = null,
    search = null,
    limit = 60,
    offset = 0,
    sort = "featured",
    discountedOnly = false,
    sizes = [],
    colours = [],
    minPriceCents = null,
    maxPriceCents = null,
  } = filter;

  if (!hasDatabase) {
    let items = [...demoProducts];
    if (categorySlug) {
      items = items.filter((p) => p.categorySlug === categorySlug);
    }
    if (search && search.trim() !== "") {
      const needle = search.trim().toLowerCase();
      items = items.filter((p) =>
        `${p.name} ${p.tagline ?? ""} ${p.description ?? ""}`
          .toLowerCase()
          .includes(needle),
      );
    }
    if (discountedOnly) {
      items = items.filter(
        (p) => p.compareAtCents !== null && p.compareAtCents > p.priceCents,
      );
    }
    if (minPriceCents !== null) {
      items = items.filter((p) => p.priceCents >= minPriceCents);
    }
    if (maxPriceCents !== null) {
      items = items.filter((p) => p.priceCents <= maxPriceCents);
    }
    // Size/colour filtering needs the derived variant shape in demo mode.
    if (sizes.length > 0) {
      items = items.filter((p) =>
        sizesFor(p.slug, p.categorySlug).some((size) => sizes.includes(size)),
      );
    }
    if (colours.length > 0) {
      items = items.filter((p) =>
        colourwaysFor(p.slug).some((colour) => colours.includes(colour.name)),
      );
    }
    items = sortDemoProducts(items, sort);
    return items.slice(offset, offset + limit);
  }

  // Every value is bound as a parameter - no string interpolation into SQL.
  const where: string[] = [];
  const params: unknown[] = [];

  if (categorySlug) {
    params.push(categorySlug);
    where.push(`c.slug = $${params.length}`);
  }
  if (search && search.trim() !== "") {
    params.push(search.trim());
    where.push(`(
      to_tsvector('english', coalesce(p.name,'') || ' ' || coalesce(p.tagline,'') || ' ' || coalesce(p.description,''))
        @@ plainto_tsquery('english', $${params.length})
      OR p.name ILIKE '%' || $${params.length} || '%'
    )`);
  }
  if (discountedOnly) {
    // A markdown means compare_at is set and above the selling price.
    where.push(`p.compare_at_cents IS NOT NULL AND p.compare_at_cents > p.price_cents`);
  }
  if (minPriceCents !== null) {
    params.push(minPriceCents);
    where.push(`p.price_cents >= $${params.length}`);
  }
  if (maxPriceCents !== null) {
    params.push(maxPriceCents);
    where.push(`p.price_cents <= $${params.length}`);
  }
  // An item matches when SOME variant satisfies the request, and when several
  // sizes are asked for it must be able to satisfy all of them - otherwise
  // ticking "S" and "M" would offer clothes that only come in one of the two.
  if (sizes.length > 0) {
    params.push(sizes);
    where.push(`(
      SELECT count(DISTINCT v.size) FROM product_variants v
       WHERE v.product_id = p.id AND v.size = ANY($${params.length}::text[]) AND v.stock > 0
    ) = ${sizes.length}`);
  }
  if (colours.length > 0) {
    params.push(colours);
    where.push(`EXISTS (
      SELECT 1 FROM product_variants v
       WHERE v.product_id = p.id AND v.colour = ANY($${params.length}::text[]) AND v.stock > 0
    )`);
  }

  params.push(limit, offset);

  const rows = await query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${ORDER_BY[sort] ?? ORDER_BY.featured}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map(mapProduct);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  if (!hasDatabase) return demoProductBySlug(slug);
  const row = await queryOne<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.slug = $1
      LIMIT 1`,
    [slug],
  );
  return row ? mapProduct(row) : null;
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  if (!hasDatabase) {
    return ids.map(demoProductById).filter((p): p is Product => p !== null);
  }
  const rows = await query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ANY($1::uuid[])`,
    [ids],
  );
  const byId = new Map(rows.map((row) => [row.id, mapProduct(row)]));
  // Preserve the caller's ordering.
  return ids.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
}

export async function getRelatedProducts(
  product: Product,
  limit = 4,
): Promise<Product[]> {
  if (product.categoryId === null) {
    return (await getFeaturedProducts(limit + 1))
      .filter((p) => p.id !== product.id)
      .slice(0, limit);
  }
  if (!hasDatabase) {
    return demoProducts
      .filter((p) => p.id !== product.id && p.categoryId === product.categoryId)
      .slice(0, limit);
  }
  const rows = await query<ProductRow>(
    `SELECT ${PRODUCT_COLUMNS}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.category_id = $1 AND p.id <> $2
      ORDER BY p.rating DESC, p.review_count DESC
      LIMIT $3`,
    [product.categoryId, product.id, limit],
  );
  return rows.map(mapProduct);
}

/** Numbers for the "data section" in the layout sketch. */
export type StorefrontStats = {
  products: number;
  categories: number;
  averageRating: number;
  reviews: number;
  freeShippingOver: number;
};

const FREE_SHIPPING_OVER = 15000;

export async function getStorefrontStats(): Promise<StorefrontStats> {
  if (!hasDatabase) {
    const reviews = demoProducts.reduce((sum, p) => sum + p.reviewCount, 0);
    const average =
      demoProducts.length === 0
        ? 0
        : demoProducts.reduce((sum, p) => sum + p.rating, 0) / demoProducts.length;
    return {
      products: demoProducts.length,
      categories: demoCategories.length,
      averageRating: Math.round(average * 10) / 10,
      reviews,
      freeShippingOver: FREE_SHIPPING_OVER,
    };
  }
  const row = await queryOne<{
    products: number | string;
    categories: number | string;
    average_rating: number | string | null;
    reviews: number | string;
  }>(
    `SELECT
       (SELECT count(*) FROM products)                       AS products,
       (SELECT count(*) FROM categories)                     AS categories,
       (SELECT round(avg(rating), 1) FROM products)          AS average_rating,
       (SELECT coalesce(sum(review_count), 0) FROM products) AS reviews`,
  );
  return {
    products: toInt(row?.products),
    categories: toInt(row?.categories),
    averageRating: Number(row?.average_rating ?? 0),
    reviews: toInt(row?.reviews),
    freeShippingOver: FREE_SHIPPING_OVER,
  };
}

// ---------------------------------------------------------------------------
// Live price / stock verification (backlog item 9)
// ---------------------------------------------------------------------------

/** One cart line as the browser believed it, compared against the server. */
export type ClientCartLine = {
  productId: string;
  quantity: number;
  /** The unit price the browser had when the cart was drawn. */
  believedPriceCents: number;
};

export type PriceChange = {
  productId: string;
  slug: string;
  name: string;
  quantity: number;
  believedPriceCents: number;
  actualPriceCents: number;
  availableStock: number;
  /** "none" | "price" | "stock" | "removed" */
  kind: "none" | "price" | "stock" | "removed";
  message: string;
};

export type PriceCheck = {
  /** True when nothing moved since the browser drew the cart. */
  unchanged: boolean;
  changes: PriceChange[];
  /** The instant the server produced this answer, for the "just now" line. */
  checkedAt: number;
};

/**
 * Re-price a cart against the database and describe anything that moved.
 *
 * This is what backs the "Prices confirmed just now" line. It never mutates and
 * never throws: the checkout page calls it on load, after the hold is taken, and
 * again before the order is placed, so a shopper always sees the real number
 * before they pay.
 */
export async function checkCartPrices(
  lines: ClientCartLine[],
  promotion: { priceCents: number } | null = null,
): Promise<PriceCheck> {
  const checkedAt = Date.now();
  if (lines.length === 0) {
    return { unchanged: true, changes: [], checkedAt };
  }

  const products = await getProductsByIds(lines.map((line) => line.productId));
  const byId = new Map(products.map((product) => [product.id, product]));
  const changes: PriceChange[] = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) {
      changes.push({
        productId: line.productId,
        slug: "",
        name: "An item in your cart",
        quantity: line.quantity,
        believedPriceCents: line.believedPriceCents,
        actualPriceCents: 0,
        availableStock: 0,
        kind: "removed",
        message: "This item is no longer available and was removed.",
      });
      continue;
    }

    const actualPriceCents = product.priceCents;

    if (product.stock < line.quantity) {
      changes.push({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        quantity: line.quantity,
        believedPriceCents: line.believedPriceCents,
        actualPriceCents,
        availableStock: product.stock,
        kind: product.stock === 0 ? "removed" : "stock",
        message:
          product.stock === 0
            ? `${product.name} has just sold out.`
            : `Only ${product.stock} of ${product.name} left - reduce the quantity to continue.`,
      });
      continue;
    }

    if (actualPriceCents !== line.believedPriceCents) {
      const rose = actualPriceCents > line.believedPriceCents;
      changes.push({
        productId: product.id,
        slug: product.slug,
        name: product.name,
        quantity: line.quantity,
        believedPriceCents: line.believedPriceCents,
        actualPriceCents,
        availableStock: product.stock,
        kind: "price",
        message: rose
          ? `${product.name} now costs more than when you added it.`
          : `${product.name} is now cheaper than when you added it.`,
      });
    }
  }

  void promotion; // Sale pricing is applied by the caller via salePriceFor().
  return { unchanged: changes.length === 0, changes, checkedAt };
}

/**
 * How many products matched a filter, without downloading them.
 *
 * The listing uses this to say "Showing 12 of 40".
 */
export async function countProducts(filter: ProductFilter = {}): Promise<number> {
  const { categorySlug = null, search = null } = filter;

  if (!hasDatabase) {
    const all = await getProducts({ ...filter, limit: 1000, offset: 0 });
    void search;
    void categorySlug;
    return all.length;
  }

  const where: string[] = [];
  const params: unknown[] = [];
  if (categorySlug) {
    params.push(categorySlug);
    where.push(`c.slug = $${params.length}`);
  }
  if (search && search.trim() !== "") {
    params.push(search.trim());
    where.push(`(
      to_tsvector('english', coalesce(p.name,'') || ' ' || coalesce(p.tagline,'')) @@ plainto_tsquery('english', $${params.length})
      OR p.name ILIKE '%' || $${params.length} || '%'
    )`);
  }

  const row = await queryOne<{ total: number | string }>(
    `SELECT count(*)::int AS total
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}`,
    params,
  );
  const total = row?.total ?? 0;
  return typeof total === "number" ? total : Number.parseInt(total, 10);
}
