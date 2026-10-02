import type { Product } from "@/lib/types";

/**
 * Product artwork.
 *
 * Resolution order:
 *   1. `image_url` from the catalogue - a real photograph, either an absolute
 *      URL or a path served from /public.
 *   2. The deterministic SVG at /api/product-image/<slug>.
 *
 * `npm run images` downloads photographs into /public/products and writes the
 * resulting paths back into catalogue.json, so step 1 covers every product once
 * that script has run. Until then nothing is broken - the generated art is a
 * deliberate fallback, not a placeholder.
 *
 * A plain <img> is used rather than next/image because the generated fallback is
 * an SVG, which the image optimiser refuses to process - and there is nothing to
 * optimise about art produced locally.
 */
export function ProductImage({
  product,
  className = "",
  sizes,
  priority = false,
}: {
  product: Pick<Product, "name" | "imageUrl" | "slug">;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const src = product.imageUrl ?? `/api/product-image/${product.slug}`;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={product.name}
      width={800}
      height={800}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
