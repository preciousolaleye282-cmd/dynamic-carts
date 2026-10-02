import type { Metadata } from "next";
import Link from "next/link";
import { CatalogueView } from "@/components/catalogue-view";
import { getCategories, getProducts, type ProductSort } from "@/lib/queries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;

const SORT_VALUES: ProductSort[] = [
  "featured",
  "price-asc",
  "price-desc",
  "rating",
  "newest",
];

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const q = first(params.q);
  const category = first(params.category);

  const title = q
    ? `Search: ${q}`
    : category
      ? `Category: ${category}`
      : "All products";

  return { title, description: `Browse ${title.toLowerCase()} at Dynamic Carts.` };
}

function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** The catalogue: everything, or filtered by search term, category and sort. */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = first(params.q);
  const category = first(params.category);
  const sortParam = first(params.sort);
  const sort: ProductSort = SORT_VALUES.includes(sortParam as ProductSort)
    ? (sortParam as ProductSort)
    : "featured";

  // Two fetches: the visible page, and a count so the grid can say
  // "showing 12 of 40" without downloading the whole catalogue.
  const [products, categories, allMatching] = await Promise.all([
    getProducts({ search: q, categorySlug: category, sort, limit: PAGE_SIZE }),
    getCategories(),
    getProducts({ search: q, categorySlug: category, sort, limit: 200 }),
  ]);

  const heading = q
    ? `Results for "${q}"`
    : category
      ? (categories.find((c) => c.slug === category)?.name ?? "Category")
      : "All products";

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-400">
        <Link href="/" className="hover:text-ink-700">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink-600">{heading}</span>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
          {heading}
        </h1>
        {q && (
          <p className="mt-1 text-sm text-ink-500">
            Searching names, taglines and descriptions.{" "}
            <Link href="/search" className="font-medium text-brand-700 underline">
              Clear search
            </Link>
          </p>
        )}
      </header>

      <CatalogueView
        initialProducts={products}
        categories={categories}
        categorySlug={category}
        search={q}
        sort={sort}
        totalHint={allMatching.length}
      />
    </div>
  );
}
