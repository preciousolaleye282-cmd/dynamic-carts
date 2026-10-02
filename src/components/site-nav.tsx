"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart, useShopper } from "@/lib/cart";
import { CartLogo } from "./cart-logo";

/**
 * The floating pill navigation.
 *
 * Modelled on the two nav references: a fully rounded floating bar with a
 * circular brand mark on the left, navigation links in the middle and
 * icon+count actions on the right. It keeps every behaviour of the previous
 * bar - search (including the "/" shortcut), cart badge and Google sign-in -
 * and adds a wishlist counter.
 */

const NAV_LINKS = [
  { href: "/search?sort=newest", label: "New arrivals" },
  { href: "/search", label: "All products" },
  { href: "/search?sort=rating", label: "Best sellers" },
  { href: "/search?sort=price-asc", label: "Offers" },
];

export function SiteNav({
  user,
  googleAuth,
}: {
  // Mirrors `SessionUser` from lib/auth - the layout resolves the session once
  // and hands the same shape down.
  user: { name: string | null; email: string; picture: string | null } | null;
  /**
   * Whether Google sign-in is configured, passed in from the server layout.
   *
   * It MUST NOT be read from `@/lib/env` in here. That module reads
   * `process.env`, and Next.js only inlines `NEXT_PUBLIC_*` into the browser
   * bundle - so on the client every `read()` returns null and `hasGoogleAuth`
   * would be false even though it is true on the server. The server would then
   * render the sign-in buttons and the client would render nothing, which React
   * reports as a hydration mismatch and which silently throws away the whole
   * server tree on every page load.
   */
  googleAuth: boolean;
}) {
  const cart = useCart();
  const shopper = useShopper();
  const router = useRouter();
  const params = useSearchParams();

  const [term, setTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = params.get("q") ?? "";

  // Keep the field in step with the URL (back button, category links, ...).
  useEffect(() => {
    setTerm(search);
  }, [search]);

  // "/" focuses search, the way every decent shop does it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      setSearchOpen(true);
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Escape closes the mobile search overlay.
  useEffect(() => {
    if (!searchOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchOpen]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const q = term.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    setSearchOpen(false);
  };

  const initials = (user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase();
  const wishCount = shopper.wishlist.length;

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="mx-auto flex max-w-7xl items-center gap-2 rounded-full border border-ink-200 bg-ink-100/90 p-1.5 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        {/* Circular brand mark, as in the reference nav. */}
        <Link
          href="/"
          className="group grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 transition hover:bg-brand-500"
          aria-label="Dynamic Carts home"
        >
          <CartLogo inverted className="h-6 w-6" />
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 text-sm font-medium text-ink-600 transition hover:bg-ink-200 hover:text-ink-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-1 lg:flex-none">
          {/* Inline search on tablet and up. */}
          <form
            onSubmit={submit}
            role="search"
            className="hidden min-w-0 flex-1 items-center gap-2 rounded-full border border-ink-200 bg-ink-50 px-4 py-2 md:flex md:w-52 lg:w-60 xl:w-72"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-ink-500" aria-hidden="true">
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 4 4" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search products…"
              aria-label="Search products"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-500"
            />
            {!term && (
              <kbd className="hidden shrink-0 rounded border border-ink-300 px-1.5 py-0.5 text-[10px] text-ink-500 xl:block">
                /
              </kbd>
            )}
          </form>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="grid h-10 w-10 place-items-center rounded-full text-ink-600 transition hover:bg-ink-200 md:hidden"
            aria-label="Search"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 4 4" strokeLinecap="round" />
            </svg>
          </button>

          <Link
            href="/wishlist"
            className="relative grid h-10 w-10 place-items-center rounded-full text-ink-600 transition hover:bg-ink-200"
            aria-label={`Wishlist, ${wishCount} item${wishCount === 1 ? "" : "s"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path
                d="M12 20.5 4.8 13.3a4.6 4.6 0 0 1 6.5-6.5l.7.7.7-.7a4.6 4.6 0 0 1 6.5 6.5Z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {shopper.ready && wishCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">
                {wishCount}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={cart.open}
            className="relative grid h-10 w-10 place-items-center rounded-full text-ink-600 transition hover:bg-ink-200"
            aria-label={`Open cart, ${cart.count} item${cart.count === 1 ? "" : "s"}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path
                d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 8H6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="10" cy="20" r="1.4" />
              <circle cx="18" cy="20" r="1.4" />
            </svg>
            {cart.ready && cart.count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">
                {cart.count > 99 ? "99+" : cart.count}
              </span>
            )}
          </button>

          {user ? (
            <Link
              href="/account"
              className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-ink-200 text-sm font-semibold text-ink-900"
              title={user.email}
            >
              {user.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.picture} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </Link>
          ) : googleAuth ? (
            // Both actions are always offered, not just on sm+. A single
            // "Sign in" would leave phone users with no visible way in at all,
            // and the pair only fits from `sm` up - below that the page has a
            // full-screen menu of its own (see AccountLinks in the footer).
            <div className="ml-1 flex shrink-0 items-center gap-1.5">
              <Link
                href="/login"
                className="rounded-full bg-ink-200 px-3.5 py-2.5 text-sm font-medium text-ink-900 transition hover:bg-ink-300 sm:px-4"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 sm:px-4"
              >
                Sign up
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobile search overlay. */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start bg-ink-50/95 p-4 pt-20 backdrop-blur md:hidden">
          <form onSubmit={submit} role="search" className="flex w-full items-center gap-2 rounded-full border border-ink-200 bg-ink-100 px-4 py-3">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-ink-500" aria-hidden="true">
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 4 4" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              autoFocus
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search products…"
              aria-label="Search products"
              className="w-full bg-transparent text-base outline-none placeholder:text-ink-500"
            />
            <button type="button" onClick={() => setSearchOpen(false)} className="shrink-0 rounded-full bg-ink-200 px-3 py-1 text-sm text-ink-700">
              Close
            </button>
          </form>
        </div>
      )}
    </header>
  );
}