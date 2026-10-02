import { NextResponse } from "next/server";
import { getCategories, getProducts, type ProductSort } from "@/lib/queries";

export const dynamic = "force-dynamic";

const SORTS: ProductSort[] = ["featured", "price-asc", "price-desc", "rating", "newest"];

/**
 * Paginated catalogue feed, used by the "Load more" button so the grid can grow
 * without a full navigation. Shares `getProducts` with the server components, so
 * demo mode and Postgres mode behave identically.
 *
 * GET /api/products?category=&q=&sort=&offset=&limit=
 */
export async function GET(request: Request): Promise<NextResponse> {
  const params = new URL(request.url).searchParams;

  const limitParam = Number.parseInt(params.get("limit") ?? "12", 10);
  const offsetParam = Number.parseInt(params.get("offset") ?? "0", 10);
  // Always clamp what the browser can ask for, so one request cannot pull the
  // whole table.
  const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : 12, 1), 24);
  const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);

  const sortParam = params.get("sort");
  const sort: ProductSort = SORTS.includes(sortParam as ProductSort)
    ? (sortParam as ProductSort)
    : "featured";

  const [products, categories] = await Promise.all([
    getProducts({
      categorySlug: params.get("category"),
      search: params.get("q"),
      sort,
      limit,
      offset,
    }),
    getCategories(),
  ]);

  return NextResponse.json({
    products,
    // `categories` lets the client render the filter pills it has not seen yet.
    categories,
    offset,
    limit,
    // Ask for one more than we return: if we got it, another page exists.
    hasMore: products.length === limit,
  });
}
