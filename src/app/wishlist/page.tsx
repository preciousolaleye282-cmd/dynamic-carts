import type { Metadata } from "next";
import { WishlistView } from "@/components/wishlist-view";
import { getProducts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wishlist",
  description: "Everything you have saved for later.",
};

export default async function WishlistPage() {
  // The wishlist stores ids only, so the full catalogue is needed to render it.
  // The layout already fetched exactly this list for the cart, but that context
  // is client-side; fetching here keeps the page independent.
  const catalogue = await getProducts({ limit: 200, sort: "featured" });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink-900">Your wishlist</h1>
        <p className="mt-1 text-sm text-ink-500">
          Saved in this browser - no account needed.
        </p>
      </header>

      <WishlistView catalogue={catalogue} />
    </div>
  );
}