import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddToCart } from "@/components/add-to-cart";
import { ProductCard } from "@/components/product-card";
import { ProductImage } from "@/components/product-image";
import { Stars } from "@/components/stars";
import { discountPercent, formatCents, FREE_SHIPPING_THRESHOLD_CENTS } from "@/lib/money";
import { getProductBySlug, getRelatedProducts } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };

  return {
    title: product.name,
    description: product.tagline ?? product.description ?? undefined,
    openGraph: { title: product.name, description: product.tagline ?? undefined },
  };
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product, 4);
  const discount = discountPercent(product.priceCents, product.compareAtCents);

  return (
    <div className="space-y-16">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-400">
        <Link href="/" className="hover:text-ink-700">
          Home
        </Link>
        <span aria-hidden="true"> / </span>
        {product.categorySlug ? (
          <>
            <Link
              href={`/search?category=${product.categorySlug}`}
              className="hover:text-ink-700"
            >
              {product.categoryName}
            </Link>
            <span aria-hidden="true"> / </span>
          </>
        ) : null}
        <span className="text-ink-600">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="card-surface overflow-hidden">
          <div className="relative aspect-square">
            <ProductImage
              product={product}
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            {discount !== null && (
              <span className="absolute left-4 top-4 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-bold text-white">
                Save {discount}%
              </span>
            )}
          </div>
        </div>

        <div>
          {product.categoryName && (
            <Link
              href={`/search?category=${product.categorySlug}`}
              className="text-xs font-semibold uppercase tracking-wide text-brand-700 hover:underline"
            >
              {product.categoryName}
            </Link>
          )}

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
            {product.name}
          </h1>

          <div className="mt-2">
            <Stars rating={product.rating} reviewCount={product.reviewCount} size="md" />
          </div>

          {product.tagline && (
            <p className="mt-4 text-base text-ink-600">{product.tagline}</p>
          )}

          <p className="mt-5 flex items-baseline gap-3">
            <span className="text-3xl font-bold text-ink-900">
              {formatCents(product.priceCents)}
            </span>
            {product.compareAtCents !== null &&
              product.compareAtCents > product.priceCents && (
                <span className="text-base text-ink-400 line-through">
                  {formatCents(product.compareAtCents)}
                </span>
              )}
          </p>

          {product.stock > 0 && (
            <p className="mt-1 text-sm text-ink-500">
              In stock &middot; {product.stock} available
            </p>
          )}

          <div className="mt-6">
            <Suspense fallback={<div className="h-12" />}>
                <AddToCart product={product} />
              </Suspense>
          </div>

          {product.description && (
            <div className="mt-8 border-t border-ink-200 pt-6">
              <h2 className="text-sm font-semibold text-ink-900">About this product</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                {product.description}
              </p>
            </div>
          )}

          <dl className="mt-6 grid gap-3 border-t border-ink-200 pt-6 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Delivery</dt>
              <dd className="text-right text-ink-800">
                Free over {formatCents(FREE_SHIPPING_THRESHOLD_CENTS)}, otherwise $6.00
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Returns</dt>
              <dd className="text-right text-ink-800">30 days, no questions</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-500">Product code</dt>
              <dd className="text-right font-mono text-xs text-ink-800">{product.slug}</dd>
            </div>
          </dl>
        </div>
      </div>

      {related.length > 0 && (
        <section>
          <h2 className="text-xl font-bold tracking-tight text-ink-900">
            You might also like
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
