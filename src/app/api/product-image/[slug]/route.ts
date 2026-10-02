import { getProductBySlug } from "@/lib/queries";
import { buildProductSvg, NO_PRODUCT_SVG } from "@/lib/product-art";

/**
 * Generated product art.
 *
 * The catalogue deliberately ships without bitmap images (licensing, size, and
 * the fact that stock assets are not available here). Instead each product
 * gets a deterministic SVG derived from its slug and category, so the same
 * product always renders the same artwork, there are no binary files in the
 * repo, and nothing 404s. The drawing itself lives in lib/product-art.
 *
 * Set `products.image_url` to any absolute URL to override this entirely.
 */

export const revalidate = 86400;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  // An unknown slug still returns a valid image rather than a broken card, but
  // it says so plainly instead of inventing a product.
  if (!product) {
    return new Response(NO_PRODUCT_SVG, { headers: svgHeaders() });
  }

  return new Response(
    buildProductSvg({
      slug: product.slug,
      name: product.name,
      tagline: product.tagline,
      category: product.categorySlug,
      glyph:
        product.categorySlug?.slice(0, 1).toUpperCase() ??
        product.name.slice(0, 1).toUpperCase(),
    }),
    { headers: svgHeaders() },
  );
}

function svgHeaders(): HeadersInit {
  return {
    "content-type": "image/svg+xml; charset=utf-8",
    // Cached hard: the output only changes if the product name/category does.
    "cache-control": "public, max-age=86400, immutable",
  };
}
