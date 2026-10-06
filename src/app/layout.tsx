import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CartDrawer } from "@/components/cart-drawer";
import { CartLogo } from "@/components/cart-logo";
import { InstallPrompt } from "@/components/install-prompt";
import { SiteNav } from "@/components/site-nav";
import { getCurrentUser } from "@/lib/auth";
import { CartProvider, ShopperProvider } from "@/lib/cart";
import { hasGoogleAuth } from "@/lib/env";
import { getProducts } from "@/lib/queries";
import { formatCents, FREE_SHIPPING_THRESHOLD_CENTS } from "@/lib/money";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Dynamic Carts - a storefront that keeps up",
    template: "%s | Dynamic Carts",
  },
  description:
    "Dynamic Carts is a demo storefront: fast catalogue search, a cart that follows you between devices, and a checkout that prices everything on the server.",
  openGraph: {
    title: "Dynamic Carts",
    description: "A storefront with live search, a persistent cart and server-priced checkout.",
    type: "website",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // "black-translucent" lets the UI run under the status bar; the
    // safe-area padding in globals.css keeps content clear of the notch.
    statusBarStyle: "black-translucent",
    title: "Dynamic Carts",
  },
  formatDetection: {
    // Stop iOS turning prices and phone numbers into tappable links, which
    // fights with the tap targets on the product cards.
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // iOS only reads apple-touch-icon, and ignores the manifest.
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

/**
 * `viewport-fit=cover` is what makes the safe-area insets non-zero, letting the
 * layout sit under the notch instead of inside it. `theme-color` must match the
 * manifest or the browser chrome flashes the wrong colour on cold start.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Not capped: capping it breaks pinch-zoom, which is an accessibility
  // failure. The layout is responsive instead.
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0a0a0b",
};

/**
 * The shell: search + account + cart across the top, page content in the
 * middle, a quiet footer at the bottom.
 *
 * The whole catalogue is handed to `CartProvider` so the cart can turn the
 * `{ productId, quantity }` pairs it stores into real lines - names, prices and
 * images always come from the database, never from the browser.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [user, catalogue] = await Promise.all([
    getCurrentUser(),
    // The cart needs to resolve any product it might hold, so this is the full
    // catalogue rather than the page's filtered slice.
    getProducts({ limit: 200, sort: "featured" }),
  ]);

  return (
    <html lang="en">
      <body className="min-h-dvh">
        {/* Keyboard and screen-reader users land here first, so they can bypass
            the header. Visually hidden until focused. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-brand-600 focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>

        <CartProvider catalogue={catalogue} signedIn={user !== null}>
          {/* Wishlist + recently viewed. Sits inside the cart provider because
              both resolve product ids against the same catalogue. */}
          <ShopperProvider signedIn={user !== null}>
            {/* `useSearchParams` in the nav needs a boundary to render.
                `googleAuth` is passed in because the nav is a client component
                and cannot read server-only env vars itself - see the prop's
                doc comment in site-nav.tsx. */}
            <Suspense fallback={<div className="h-[68px]" />}>
              <SiteNav user={user} googleAuth={hasGoogleAuth} />
            </Suspense>

            <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-8 focus:outline-none sm:px-6">
              {children}
            </main>

            <SiteFooter />
            <CartDrawer />
            {/* Registers the service worker and offers the install prompt. It must
                live in the root layout: `beforeinstallprompt` fires once and is
                only capturable by a listener mounted from the first paint. */}
            <InstallPrompt />
          </ShopperProvider>
        </CartProvider>
      </body>
    </html>
  );
}

const FOOTER_LINKS: { href: string; label: string }[] = [
  { href: "/search?sort=featured", label: "All products" },
  { href: "/search?sort=price-asc", label: "Best value" },
  { href: "/search?sort=rating", label: "Top rated" },
  { href: "/account", label: "Your account" },
  { href: "/login", label: "Log in" },
  { href: "/signup", label: "Sign up with Google" },
];

function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-ink-200 bg-ink-100">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-600">
              <CartLogo inverted className="h-6 w-6" />
            </span>
            <span className="font-bold text-ink-900">Dynamic Carts</span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-ink-500">
            A reference storefront: server-priced checkout, Google sign-in, Postgres-backed
            carts and order confirmations by email.
          </p>
        </div>

        <nav aria-label="Shop">
          <h2 className="text-sm font-semibold text-ink-900">Shop</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-500">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-brand-700">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-sm font-semibold text-ink-900">What you get</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-500">
            <li>Free standard delivery over {formatCents(FREE_SHIPPING_THRESHOLD_CENTS)}</li>
            <li>30-day returns, no questions</li>
            <li>Stock is locked at checkout, never oversold</li>
          </ul>
        </div>
      </div>

      <div className="app-safe-bottom border-t border-ink-100">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-ink-400 sm:px-6">
          &copy; {new Date().getFullYear()} Dynamic Carts. Built as a demo - no real payments
          are taken.
        </p>
      </div>
    </footer>
  );
}
