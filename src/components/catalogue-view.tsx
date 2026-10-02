"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { ProductCard } from "@/components/product-card";
import type { Category, Product } from "@/lib/types";
import type { ProductSort } from "@/lib/queries";

const PAGE_SIZE = 12;

const SORTS: { value: ProductSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Top rated" },
  { value: "newest", label: "Newest" },
];

/**
 * The catalogue view: category pills, a sort select and a grid that grows with
 * "Load more".
 *
 * Filtering rewrites the URL rather than filtering in place, so a filtered view
 * is linkable and the back button behaves. Load-more pages are appended
 * client-side from /api/products, which runs the same query the server page did.
 */
export function CatalogueView({
  initialProducts,
  categories,
  categorySlug,
  search,
  sort,
  totalHint,
}: {
  initialProducts: Product[];
  categories: Category[];
  categorySlug: string | null;
  search: string | null;
  sort: ProductSort;
  totalHint: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [products, setProducts] = useState(initialProducts);
  const [offset, setOffset] = useState(initialProducts.length);
  const [hasMore, setHasMore] = useState(initialProducts.length < PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // A new filter (server navigation) replaces everything.
  useEffect(() => {
    setProducts(initialProducts);
    setOffset(initialProducts.length);
    setHasMore(initialProducts.length < PAGE_SIZE);
    setLoadError(null);
  }, [initialProducts]);

  const navigate = useCallback(
    (next: { category?: string | null; sort?: ProductSort }) => {
      const params = new URLSearchParams();
      const nextCategory = next.category === undefined ? categorySlug : next.category;
      const nextSort = next.sort ?? sort;
      if (search) params.set("q", search);
      if (nextCategory) params.set("category", nextCategory);
      if (nextSort !== "featured") params.set("sort", nextSort);

      const query = params.toString();
      startTransition(() => {
        router.push(query ? `/search?${query}` : "/search");
      });
    },
    [categorySlug, router, search, sort],
  );

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(PAGE_SIZE),
        sort,
      });
      if (categorySlug) params.set("category", categorySlug);
      if (search) params.set("q", search);

      const response = await fetch(`/api/products?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);

      const payload = (await response.json()) as {
        products: Product[];
        hasMore: boolean;
      };
      setProducts((current) => {
        // Guard against a double click landing the same page twice.
        const seen = new Set(current.map((product) => product.id));
        return [
          ...current,
          ...payload.products.filter((product) => !seen.has(product.id)),
        ];
      });
      setOffset((current) => current + payload.products.length);
      setHasMore(payload.hasMore);
    } catch {
      setLoadError("Could not load more products. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  }, [categorySlug, offset, search, sort]);

  return (
    <CatalogueBody
      products={products}
      categories={categories}
      categorySlug={categorySlug}
      search={search}
      sort={sort}
      totalHint={totalHint}
      isPending={isPending}
      navigate={navigate}
      hasMore={hasMore}
      loadingMore={loadingMore}
      loadError={loadError}
      loadMore={loadMore}
    />
  );
}

type CatalogueBodyProps = {
  products: Product[];
  categories: Category[];
  categorySlug: string | null;
  search: string | null;
  sort: ProductSort;
  totalHint: number;
  isPending: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadError: string | null;
  navigate: (next: { category?: string | null; sort?: ProductSort }) => void;
  loadMore: () => void;
};

function CatalogueBody({
  products,
  categories,
  categorySlug,
  search,
  sort,
  totalHint,
  isPending,
  hasMore,
  loadingMore,
  loadError,
  navigate,
  loadMore,
}: CatalogueBodyProps) {
  const shown = products.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ul className="flex flex-wrap gap-2" aria-label="Filter by category">
          <li>
            <button
              type="button"
              onClick={() => navigate({ category: null })}
              aria-pressed={categorySlug === null}
              className={`pill px-4 py-2 text-sm font-medium transition ${
                categorySlug === null
                  ? "border-brand-500 bg-brand-600 text-white"
                  : "bg-ink-100 text-ink-700 hover:border-ink-300"
              }`}
            >
              All
            </button>
          </li>
          {categories.map((category) => {
            const active = categorySlug === category.slug;
            return (
              <li key={category.id}>
                <button
                  type="button"
                  onClick={() => navigate({ category: category.slug })}
                  aria-pressed={active}
                  className={`pill px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "border-brand-500 bg-brand-600 text-white"
                      : "bg-ink-100 text-ink-700 hover:border-ink-300"
                  }`}
                >
                  {category.name}
                </button>
              </li>
            );
          })}
        </ul>

        <label className="flex shrink-0 items-center gap-2 text-sm text-ink-500">
          <span>Sort</span>
          <select
            value={sort}
            onChange={(event) => navigate({ sort: event.target.value as ProductSort })}
            className="pill bg-ink-100 px-4 py-2 text-sm text-ink-800 outline-none"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isPending && (
        <p className="text-sm text-ink-400" role="status">
          Updating…
        </p>
      )}

      {shown === 0 ? (
        <div className="card-surface px-6 py-16 text-center">
          <p className="font-semibold text-ink-900">No products matched.</p>
          <p className="mt-1 text-sm text-ink-500">
            {search
              ? `Nothing found for "${search}". Try a shorter search or another category.`
              : "Try choosing a different category."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink-500" role="status">
            Showing {shown}
            {totalHint > shown ? ` of ${totalHint}` : ""} product
            {shown === 1 ? "" : "s"}
          </p>

          <div
            className={`grid grid-cols-2 gap-4 transition-opacity sm:gap-5 lg:grid-cols-4 ${
              isPending ? "opacity-60" : ""
            }`}
          >
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </div>
        </>
      )}

      {loadError && (
        <p className="text-center text-sm text-red-600" role="alert">
          {loadError}
        </p>
      )}

      {hasMore && shown > 0 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="btn btn-ghost px-6 py-3 text-sm"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
