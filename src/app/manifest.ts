import type { MetadataRoute } from "next";

/**
 * The web app manifest - what makes this installable on a phone.
 *
 * Served from a route rather than a static file so the URLs are absolute and
 * resolved against whatever origin it is deployed to. A relative `src` in a
 * manifest is resolved against the manifest URL, which breaks under a basePath
 * or on a preview domain.
 *
 * `start_url` carries `/?source=pwa` purely so the install flow can tell an
 * installed launch apart from a normal visit for analytics; it does not change
 * what is rendered.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dynamic Carts",
    short_name: "Dynamic Carts",
    description:
      "A storefront that keeps up: fast catalogue search, a cart that follows you between devices, and checkout priced on the server.",
    // `standalone` removes the browser chrome, which is the "app" feel. The
    // display override exists for the handful of Android builds that still
    // render a minimal URL bar in standalone.
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    scope: "/",
    start_url: "/?source=pwa",
    // Must match `theme-color` in layout.tsx, or the browser chrome flashes a
    // different colour from the app on every cold start.
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    categories: ["shopping", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Android crops maskable icons to whatever shape the launcher uses, so
        // this one is inset well inside the safe zone.
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Your cart",
        short_name: "Cart",
        url: "/?cart=open",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "All products",
        short_name: "Shop",
        url: "/search",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}