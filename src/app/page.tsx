import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { ProductHero, type HeroSlide } from "@/components/product-hero";
import { PromoStrip } from "@/components/promo-strip";
import { TrustBar } from "@/components/trust-bar";
import {
  getCategories,
  getFeaturedProducts,
  getProducts,
  getStorefrontStats,
} from "@/lib/queries";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * The home page.
 *
 * Structure follows the storefront reference top to bottom: immersive hero ->
 * promo strip -> category circles -> product rows -> trust bar. The hero is a
 * client component (carousel + size picker); everything else stays on the
 * server.
 */

/**
 * Hero copy. Kept here rather than in the catalogue so the merchandising voice
 * can be changed without touching data, and so the required headline is
 * explicit and easy to find.
 */
const HERO_COPY: Record<string, { eyebrow: string; headline: string; blurb: string }> = {
  "aurora-wool-overcoat": {
    eyebrow: "New collection",
    headline: "Elevate your day with a Dynamic Look",
    blurb:
      "Double-faced Italian wool, fully canvassed shoulders and a deep welt pocket. Cut to layer cleanly over tailoring or knitwear.",
  },
  "sienna-linen-blazer": {
    eyebrow: "Summer tailoring",
    headline: "Unstructured, and all the better for it",
    blurb:
      "Washed Belgian linen with natural horn buttons. Creases beautifully and travels without a bag.",
  },
  "vela-silk-wrap-dress": {
    eyebrow: "Bias cut silk",
    headline: "Silk that falls rather than hangs",
    blurb:
      "100% mulberry silk, cut on the bias, with a self-tie belt and a subtle sheen that shifts with the light.",
  },
};

const DEFAULT_HERO = {
  eyebrow: "Signature piece",
  headline: "Elevate your day with a Dynamic Look",
  blurb:
    "Considered fabrics, honest construction and a silhouette that works harder than you do.",
};

export default async function HomePage() {
  const [categories, featured, latest, stats] = await Promise.all([
    getCategories(),
    getFeaturedProducts(8),
    getProducts({ sort: "newest", limit: 8 }),
    getStorefrontStats(),
  ]);

  // Prefer genuinely new stock, but fall back to the featured set so the
  // "Latest" row is never empty on a freshly seeded database.
  const latestRow = latest.length > 0 ? latest : featured;

  const slides: HeroSlide[] = featured.slice(0, 3).map((product) => ({
    product,
    ...(HERO_COPY[product.slug] ?? DEFAULT_HERO),
  }));

  const deals = [...featured].sort((a, b) => {
    const da = a.compareAtCents ? 1 - a.priceCents / a.compareAtCents : 0;
    const db = b.compareAtCents ? 1 - b.priceCents / b.compareAtCents : 0;
    return db - da;
  });

  return (
    <div className="space-y-10">
      {isDemoMode && <DemoBanner />}

      {slides.length > 0 && <ProductHero slides={slides} stats={stats} />}

      <PromoStrip />

      <CategoryCircles categories={categories} />

      <ProductSection
        title="Best deals for you"
        subtitle="The deepest discounts in the catalogue"
        products={deals.slice(0, 4)}
        href="/search?sort=price-asc"
      />

      <ProductSection
        title="Featured this week"
        subtitle="Hand-picked from the catalogue"
        products={featured.slice(0, 4)}
        href="/search?sort=featured"
      />

      <ProductSection
        title="Latest arrivals"
        subtitle="Fresh in the warehouse"
        products={latestRow.slice(0, 4)}
        href="/search?sort=newest"
      />

      <TrustBar />

      <ClubSignup />
    </div>
  );
}

function ClubSignup() {
  return (
    <section className="relative overflow-hidden rounded-card border border-brand-500/40 bg-[linear-gradient(120deg,#2a0f04_0%,#7a2508_55%,#e04a12_100%)] p-8 sm:p-10">
      <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-lg">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
            Join the club
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Get early access, restocks and 10% off your first order
          </h2>
          <p className="mt-2 text-sm text-white/75">
            One email a week at most. Unsubscribe in a click.
          </p>
        </div>

        <Link
          href="/search?sort=newest"
          className="btn shrink-0 bg-white px-7 py-3.5 text-sm font-bold text-black transition hover:bg-ink-100 hover:text-white"
        >
          Join now
        </Link>
      </div>
    </section>
  );
}

function DemoBanner() {
  return (
    <p className="rounded-card border border-dashed border-ink-300 bg-ink-100 px-4 py-3 text-sm text-ink-600">
      <span className="font-semibold text-ink-900">Demo mode.</span> No{" "}
      <code className="rounded bg-ink-200 px-1 py-0.5 text-xs">DATABASE_URL</code> is set, so
      the catalogue is served from the bundled data file and orders are not persisted.{" "}
      <Link href="/account" className="font-semibold text-brand-700 underline">
        See what to configure
      </Link>
      .
    </p>
  );
}

function ProductSection({
  title,
  subtitle,
  products,
  href,
}: {
  title: string;
  subtitle: string;
  products: Awaited<ReturnType<typeof getFeaturedProducts>>;
  href: string;
}) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink-900">{title}</h2>
          <p className="text-sm text-ink-500">{subtitle}</p>
        </div>
        <Link href={href} className="btn btn-ghost shrink-0 px-4 py-2 text-sm">
          View all
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="card-surface px-5 py-10 text-center text-sm text-ink-500">
          Nothing here yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      )}
    </section>
  );
}

function CategoryCircles({
  categories,
}: {
  categories: Awaited<ReturnType<typeof getCategories>>;
}) {
  if (categories.length === 0) return null;

  return (
    <section>
      <h2 className="text-xl font-bold tracking-tight text-ink-900">Shop by category</h2>
      <p className="text-sm text-ink-500">Everything is sorted so you are not guessing.</p>

      <ul className="mt-5 flex gap-4 overflow-x-auto pb-2">
        {categories.map((category) => (
          <li key={category.id} className="shrink-0">
            <Link
              href={`/search?category=${category.slug}`}
              className="group flex w-24 flex-col items-center gap-2"
            >
              <span
                className={`cat-${category.accent} grid h-24 w-24 place-items-center rounded-full text-3xl font-bold transition group-hover:scale-105`}
                aria-hidden="true"
              >
                {category.glyph}
              </span>
              <span className="text-center text-xs font-medium text-ink-600 group-hover:text-ink-900">
                {category.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
