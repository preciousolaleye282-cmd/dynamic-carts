import { hasDatabase, query } from "./db";
import { colourwaysFor, sizesFor } from "./demo-catalogue";

/**
 * Product variants: the real colour, size and per-variant stock.
 *
 * These used to be derived from a hash of the slug. That is fine for drawing a
 * decorative swatch but it cannot be filtered in SQL, cannot mark a specific
 * size as sold out, and cannot be reserved - all of which the storefront now
 * does. So `product_variants` holds the truth and this module is the only place
 * that reads it.
 *
 * Demo mode (no DATABASE_URL) still falls back to the derived values so the app
 * renders with zero configuration.
 */

export type ColourOption = {
  name: string;
  hex: string;
};

export type SizeOption = {
  label: string;
  /** Units available in this size, summed across every colour. */
  stock: number;
  /** False when every colour of this size is sold out. */
  available: boolean;
};

export type ProductVariants = {
  colours: ColourOption[];
  sizes: SizeOption[];
  /** Total sellable units across the whole variant matrix. */
  totalStock: number;
};

export type VariantRow = {
  product_id: string;
  colour: string;
  colour_hex: string;
  size: string;
  stock: number | string;
};

/** Fixed display order, so a size run never reorders between renders. */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2Y", "4Y", "6Y", "8Y", "10Y"];

function sortSizes(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    // Unknown labels (EU shoe sizes, "One size") sort after the known run, and
    // then naturally among themselves.
    if (ia === -1 && ib === -1) return a.localeCompare(b, "en-NG", { numeric: true });
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/**
 * Collapse raw rows into the shape the UI wants.
 *
 * Kept separate from the query so both the database path and the demo path build
 * exactly the same shape, and so the collapsing logic stands on its own.
 */
export function collapseVariants(rows: VariantRow[]): ProductVariants {
  const colourMap = new Map<string, ColourOption>();
  const sizeStock = new Map<string, number>();

  for (const row of rows) {
    const colour = row.colour.trim();
    const hex = row.colour_hex.trim();
    const size = row.size.trim();
    const stock = typeof row.stock === "number" ? row.stock : Number.parseInt(row.stock, 10);
    const units = Number.isFinite(stock) ? stock : 0;

    if (colour && hex && !colourMap.has(colour)) {
      colourMap.set(colour, { name: colour, hex });
    }
    if (size) {
      sizeStock.set(size, (sizeStock.get(size) ?? 0) + Math.max(0, units));
    }
  }

  const colours = [...colourMap.values()];
  const sizes = sortSizes([...sizeStock.keys()]).map((label) => {
    const stock = sizeStock.get(label) ?? 0;
    return { label, stock, available: stock > 0 };
  });

  return {
    colours,
    sizes,
    totalStock: sizes.reduce((sum, size) => sum + size.stock, 0),
  };
}

/** Demo-mode stand-in with the same shape as the database result. */
function demoVariants(
  slug: string,
  categorySlug: string | null,
  stock: number,
): ProductVariants {
  const colours = colourwaysFor(slug);
  const sizeLabels = sizesFor(slug, categorySlug);
  // Spread the product's stock across the run, and force the two end sizes out
  // of stock so the size picker has something visibly disabled to render.
  const soldOut = new Set<string>();
  if (sizeLabels.length > 2) soldOut.add(sizeLabels[0]);
  soldOut.add(sizeLabels[sizeLabels.length - 1]);

  const sellable = Math.max(1, sizeLabels.length - soldOut.size);
  const sizes = sizeLabels.map((label) => {
    const units = soldOut.has(label) ? 0 : Math.max(1, Math.floor(stock / sellable));
    return { label, stock: units, available: units > 0 };
  });

  return {
    colours,
    sizes,
    totalStock: sizes.reduce((sum, size) => sum + size.stock, 0),
  };
}

/**
 * Every variant for a product.
 *
 * Falls back to the derived demo shape when there is no database, and also when
 * the product has no variant rows - a half-seeded database should still show a
 * usable size picker rather than an empty one.
 */
export async function getVariants(
  product: { slug: string; categorySlug: string | null; stock: number },
): Promise<ProductVariants> {
  if (!hasDatabase) return demoVariants(product.slug, product.categorySlug, product.stock);

  try {
    const rows = await query<VariantRow>(
      `SELECT v.product_id, v.colour, v.colour_hex, v.size, v.stock
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
        WHERE p.slug = $1`,
      [product.slug],
    );
    if (rows.length === 0) {
      return demoVariants(product.slug, product.categorySlug, product.stock);
    }
    return collapseVariants(rows);
  } catch (error) {
    console.error("[dynamic-carts] variant lookup failed:", error);
    return demoVariants(product.slug, product.categorySlug, product.stock);
  }
}

/**
 * Variant data for a whole page of products in one round trip.
 *
 * The listing and the layout both need this for many products at once; asking
 * one product at a time would be an N+1 query on every page render.
 */
export async function getVariantsForProducts(
  products: { id: string; slug: string; categorySlug: string | null; stock: number }[],
): Promise<Map<string, ProductVariants>> {
  const out = new Map<string, ProductVariants>();
  if (products.length === 0) return out;

  if (!hasDatabase) {
    for (const product of products) {
      out.set(product.id, demoVariants(product.slug, product.categorySlug, product.stock));
    }
    return out;
  }

  try {
    const rows = await query<VariantRow>(
      `SELECT product_id, colour, colour_hex, size, stock
         FROM product_variants
        WHERE product_id = ANY($1::uuid[])`,
      [products.map((product) => product.id)],
    );

    const byProduct = new Map<string, VariantRow[]>();
    for (const row of rows) {
      const list = byProduct.get(row.product_id);
      if (list) list.push(row);
      else byProduct.set(row.product_id, [row]);
    }

    for (const product of products) {
      const productRows = byProduct.get(product.id);
      out.set(
        product.id,
        productRows && productRows.length > 0
          ? collapseVariants(productRows)
          : demoVariants(product.slug, product.categorySlug, product.stock),
      );
    }
    return out;
  } catch (error) {
    console.error("[dynamic-carts] bulk variant lookup failed:", error);
    for (const product of products) {
      out.set(product.id, demoVariants(product.slug, product.categorySlug, product.stock));
    }
    return out;
  }
}

/**
 * The distinct sizes and colours a result set can be filtered by, plus the price
 * span. Returned alongside the grid so the filter panel only offers options that
 * would actually return something.
 */
export type FilterFacets = {
  sizes: string[];
  colours: ColourOption[];
  minPriceCents: number;
  maxPriceCents: number;
};

export async function getFilterFacets(categorySlug: string | null): Promise<FilterFacets> {
  const empty: FilterFacets = { sizes: [], colours: [], minPriceCents: 0, maxPriceCents: 0 };

  if (!hasDatabase) {
    const { demoProducts } = await import("./demo-catalogue");
    const scoped = categorySlug
      ? demoProducts.filter((product) => product.categorySlug === categorySlug)
      : demoProducts;
    if (scoped.length === 0) return empty;

    const colours = new Map<string, ColourOption>();
    const sizes = new Set<string>();
    for (const product of scoped) {
      for (const colour of colourwaysFor(product.slug)) colours.set(colour.name, colour);
      for (const size of sizesFor(product.slug, product.categorySlug)) sizes.add(size);
    }
    const prices = scoped.map((product) => product.priceCents);
    return {
      sizes: sortSizes([...sizes]),
      colours: [...colours.values()],
      minPriceCents: Math.min(...prices),
      maxPriceCents: Math.max(...prices),
    };
  }

  try {
    const rows = await query<{
      size: string;
      colour: string;
      colour_hex: string;
      price_cents: number | string;
    }>(
      `SELECT DISTINCT v.size, v.colour, v.colour_hex, p.price_cents
         FROM products p
         JOIN product_variants v ON v.product_id = p.id
         ${categorySlug ? "JOIN categories c ON c.id = p.category_id" : ""}
         ${categorySlug ? "WHERE c.slug = $1" : ""}`,
      categorySlug ? [categorySlug] : [],
    );
    if (rows.length === 0) return empty;

    const colours = new Map<string, ColourOption>();
    const sizes = new Set<string>();
    const prices: number[] = [];
    for (const row of rows) {
      if (row.size) sizes.add(row.size);
      if (row.colour && row.colour_hex) {
        colours.set(row.colour, { name: row.colour, hex: row.colour_hex });
      }
      const price =
        typeof row.price_cents === "number"
          ? row.price_cents
          : Number.parseInt(row.price_cents, 10);
      if (Number.isFinite(price)) prices.push(price);
    }

    return {
      sizes: sortSizes([...sizes]),
      colours: [...colours.values()],
      minPriceCents: prices.length > 0 ? Math.min(...prices) : 0,
      maxPriceCents: prices.length > 0 ? Math.max(...prices) : 0,
    };
  } catch (error) {
    console.error("[dynamic-carts] facet lookup failed:", error);
    return empty;
  }
}
