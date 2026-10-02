"use client";

import { useShopper } from "@/lib/cart";

/**
 * The heart toggle that sits on every product card.
 *
 * Isolated into its own client component so the card itself can stay a server
 * component where possible, and so the stored id is the only thing that has to
 * cross the boundary.
 */
export function WishlistButton({
  productId,
  name,
  className = "",
}: {
  productId: string;
  name: string;
  className?: string;
}) {
  const { inWishlist, toggleWishlist, ready } = useShopper();
  // Before hydration there is no stored list, so render the neutral state rather
  // than flashing a heart that may be about to disappear.
  const saved = ready && inWishlist(productId);

  return (
    <button
      type="button"
      onClick={(event) => {
        // The card is wrapped in a link; saving must not navigate.
        event.preventDefault();
        event.stopPropagation();
        toggleWishlist(productId);
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      title={saved ? "Saved to wishlist" : "Save to wishlist"}
      className={`grid place-items-center rounded-full transition ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-[18px] w-[18px]"
        aria-hidden="true"
      >
        <path
          d="M12 20.5 4.8 13.3a4.6 4.6 0 0 1 6.5-6.5l.7.7.7-.7a4.6 4.6 0 0 1 6.5 6.5Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}