"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CartLine, Product } from "./types";

/**
 * The shopping cart.
 *
 * Guests keep the cart in localStorage so the site is usable with no account
 * and no server. When somebody signs in, the cart is reconciled with their
 * saved server cart (taking the larger quantity of each line, so nothing from
 * either device is lost) and every later change is mirrored to Postgres.
 *
 * localStorage only ever holds `{ productId, quantity }`. Names, prices and
 * images are resolved from `catalogue` - the product list the server rendered -
 * so a stale tab can never show a price the database does not agree with, and
 * the server re-checks everything at checkout regardless.
 */

const STORAGE_KEY = "dc_cart_v1";
const MAX_PER_LINE = 99;

type StoredLine = { productId: string; quantity: number };

export type CartLineInput = {
  productId: string;
  quantity: number;
};

type CartContextValue = {
  /** False until localStorage has been read; render skeletons until then. */
  ready: boolean;
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  /** Product id most recently added, so a card can flash "Added". */
  justAdded: string | null;
  isOpen: boolean;
  open: () => void;
  close: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readStored(): CartLineInput[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Merge duplicates and drop anything malformed rather than trusting it.
    const merged = new Map<string, number>();
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const { productId, quantity } = entry as Partial<StoredLine>;
      if (typeof productId !== "string") continue;
      const amount = typeof quantity === "number" ? Math.trunc(quantity) : 1;
      if (amount < 1) continue;
      merged.set(productId, Math.min((merged.get(productId) ?? 0) + amount, MAX_PER_LINE));
    }
    return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
  } catch {
    // Corrupt or unavailable storage (private mode) - start empty.
    return [];
  }
}

/**
 * Wishlist (server-synced when signed in) and "recently viewed" (always local).
 *
 * The wishlist mirrors the cart's strategy: guests keep hearts in localStorage,
 * and once somebody is signed in every toggle is mirrored to Postgres via
 * `/api/wishlist`, folded in on sign-in with a union merge, and pulled back on
 * an interval so a heart tapped on the web appears on the phone (and vice
 * versa). Recently-viewed stays browser-local: it is a per-device signal, not
 * something worth syncing.
 *
 * Both stores are read lazily after mount so the server-rendered HTML never
 * depends on them (no hydration mismatch).
 */

const WISHLIST_KEY = "dc_wishlist_v1";
const RECENT_KEY = "dc_recent_v1";
const RECENT_LIMIT = 8;
/** How often a signed-in tab re-pulls the wishlist (matches the cart). */
const WISHLIST_POLL_MS = 8000;
/** Grace period after a local tap during which a poll must not overwrite it. */
const WISHLIST_LOCAL_WRITE_GRACE_MS = 5000;

type ShopperContextValue = {
  ready: boolean;
  wishlist: string[];
  toggleWishlist: (productId: string) => void;
  inWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
  recent: string[];
  trackView: (productId: string) => void;
};

const ShopperContext = createContext<ShopperContextValue | null>(null);

function readStore(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // Corrupt or unavailable storage (private mode, quota) must not break the
    // page - the feature simply degrades to "nothing saved".
    return [];
  }
}

function writeStore(key: string, value: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore: a failed write only means the list will not survive a refresh.
  }
}

export function ShopperProvider({
  children,
  signedIn,
}: {
  children: React.ReactNode;
  signedIn: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  const localChangeAt = useRef(0);
  const lastServerSignature = useRef("");

  /** Fire-and-forget mirror to the server. The UI never waits on this. */
  const mirrorWishlist = useCallback((body: unknown) => {
    void fetch("/api/wishlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {
      // Offline or signed out. localStorage remains the source of truth.
    });
  }, []);

  const stampWishlistChange = useCallback(() => {
    localChangeAt.current = Date.now();
  }, []);

  // First paint: load localStorage, then - if signed in - reconcile with the
  // saved server wishlist (union merge, so nothing from either device is lost).
  useEffect(() => {
    const local = readStore(WISHLIST_KEY);
    setWishlist(local);
    setRecent(readStore(RECENT_KEY));
    setReady(true);

    if (!signedIn) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/wishlist", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as { productIds?: string[] };
        const server = payload.productIds ?? [];
        if (cancelled) return;

        const merged = [...new Set([...local, ...server])];
        lastServerSignature.current = [...merged].sort().join("|");
        setWishlist(merged);
        writeStore(WISHLIST_KEY, merged);
        // Push the union back so the server learns about guest hearts too.
        if (merged.length > 0) {
          mirrorWishlist({ action: "set", productIds: merged });
        }
      } catch {
        // Keep the local wishlist; a failed sync must not block the shopper.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, mirrorWishlist]);

  /** Pull the server wishlist and adopt it, unless the shopper just tapped. */
  const pullWishlist = useCallback(async () => {
    if (!signedIn) return;
    try {
      const response = await fetch("/api/wishlist", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { productIds?: string[] };
      const server = [...new Set(payload.productIds ?? [])];

      const signature = [...server].sort().join("|");
      if (signature === lastServerSignature.current) return;
      // A local tap newer than the snapshot wins; the next poll picks up the
      // other device once our change has been sent.
      if (localChangeAt.current > Date.now() - 1000) return;

      lastServerSignature.current = signature;
      setWishlist(server);
      writeStore(WISHLIST_KEY, server);
    } catch {
      // Offline or transient failure. Try again on the next tick.
    }
  }, [signedIn]);

  // Poll while signed in so a heart tapped on the web appears on the phone
  // (and vice versa). Pauses when the tab is hidden to spare battery/data,
  // and refreshes immediately on return, on focus, and on reconnect.
  useEffect(() => {
    if (!signedIn) return;

    let timer: number | undefined;

    const start = () => {
      if (timer !== undefined) return;
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void pullWishlist();
      }, WISHLIST_POLL_MS);
    };

    const stop = () => {
      if (timer !== undefined) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        start();
        void pullWishlist();
      } else {
        stop();
      }
    };

    start();
    window.addEventListener("online", pullWishlist);
    window.addEventListener("focus", pullWishlist);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stop();
      window.removeEventListener("online", pullWishlist);
      window.removeEventListener("focus", pullWishlist);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn, pullWishlist]);

  const toggleWishlist = useCallback(
    (productId: string) => {
      setWishlist((current) => {
        const next = current.includes(productId)
          ? current.filter((id) => id !== productId)
          : [productId, ...current];
        writeStore(WISHLIST_KEY, next);
        return next;
      });
      stampWishlistChange();
      mirrorWishlist({ action: "toggle", productId });
    },
    [mirrorWishlist, stampWishlistChange],
  );

  const clearWishlist = useCallback(() => {
    setWishlist([]);
    writeStore(WISHLIST_KEY, []);
    stampWishlistChange();
    mirrorWishlist({ action: "clear" });
  }, [mirrorWishlist, stampWishlistChange]);

  const trackView = useCallback((productId: string) => {
    setRecent((current) => {
      const next = [productId, ...current.filter((id) => id !== productId)].slice(0, RECENT_LIMIT);
      writeStore(RECENT_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<ShopperContextValue>(
    () => ({
      ready,
      wishlist,
      toggleWishlist,
      inWishlist: (id: string) => wishlist.includes(id),
      clearWishlist,
      recent,
      trackView,
    }),
    [ready, wishlist, toggleWishlist, clearWishlist, recent, trackView],
  );

  return <ShopperContext.Provider value={value}>{children}</ShopperContext.Provider>;
}

export function useShopper(): ShopperContextValue {
  const context = useContext(ShopperContext);
  if (!context) throw new Error("useShopper must be used inside <ShopperProvider>");
  return context;
}

export function CartProvider({
  catalogue,
  signedIn,
  children,
}: {
  catalogue: Product[];
  signedIn: boolean;
  children: ReactNode;
}) {
  const [items, setItems] = useState<CartLineInput[]>([]);
  const [ready, setReady] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);


  const index = useMemo(
    () => new Map(catalogue.map((product) => [product.id, product])),
    [catalogue],
  );

  // Persist on every change, but never before the initial read completes or we
  // would write an empty array over a full cart.
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Quota or private mode: the cart still works for this session.
    }
  }, [items, ready]);

  /** Fire-and-forget mirror to the server. The UI never waits on this. */
  const mirror = useCallback((body: unknown) => {
    void fetch("/api/cart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {
      // Offline or signed out. localStorage remains the source of truth.
    });
  }, []);

  // First paint: load localStorage, then - if signed in - reconcile with the
  // saved server cart. Re-running this never inflates a quantity, because it
  // sends absolute `set` values rather than increments.
  useEffect(() => {
    const local = readStored();
    setItems(local);
    setReady(true);

    if (!signedIn) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/cart", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const payload = (await response.json()) as { lines?: CartLine[] };
        const server = payload.lines ?? [];
        if (cancelled) return;

        const localMap = new Map(local.map((line) => [line.productId, line.quantity]));
        const merged: CartLineInput[] = [];

        for (const line of server) {
          const productId = line.product.id;
          merged.push({
            productId,
            quantity: Math.min(
              Math.max(localMap.get(productId) ?? 0, line.quantity, 1),
              MAX_PER_LINE,
            ),
          });
        }
        // Lines the server has never seen still belong in the cart.
        for (const [productId, quantity] of localMap) {
          if (!server.some((line) => line.product.id === productId)) {
            merged.push({ productId, quantity });
          }
        }

        setItems(merged);
        // An empty server cart is not a reason to skip the push: a shopper who
        // signed in with items already in their guest cart expects those saved.
        for (const line of merged) {
          mirror({ action: "set", productId: line.productId, quantity: line.quantity });
        }
      } catch {
        // Keep the local cart; a failed sync must not block the shopper.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, mirror]);

  // ---------------------------------------------------------------------------
  // Cross-device sync
  //
  // The reconcile above only runs once, on mount. That is not enough for the
  // "add something on the web, see it on my phone" requirement: a phone left
  // open on the shop would sit there with a stale cart until it was reloaded.
  //
  // So a signed-in client also polls. Two rules keep that safe:
  //
  //   1. Never clobber a local change. Every local mutation stamps
  //      `localChangeAt`, and an incoming server snapshot is only applied if it
  //      is newer than the last local edit. Otherwise a poll landing between a
  //      tap and its optimistic update would silently undo the tap.
  //
  //   2. Pause when nobody is looking. Polling a hidden tab wastes the
  //      phone's battery and data, so the interval stops on `visibilitychange`
  //      and an immediate refresh happens on the way back in.
  //
  // Polling is deliberate over WebSockets or Supabase Realtime: this needs to
  // work on the free Supabase tier and on a plain Postgres, and a cart is
  // low-frequency. A long poll on the server would hold a database connection
  // open per client, which the pooler cannot afford.
  // ---------------------------------------------------------------------------

  const localChangeAt = useRef(0);
  /** Server snapshot we have already applied, so equal polls do no work. */
  const lastServerSignature = useRef("");

  const stampLocalChange = useCallback(() => {
    localChangeAt.current = Date.now();
  }, []);

  /** Pull the server cart and adopt it, unless the shopper is mid-edit. */
  const pullFromServer = useCallback(async () => {
    if (!signedIn) return;
    try {
      const response = await fetch("/api/cart", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { lines?: CartLine[] };
      const lines = payload.lines ?? [];

      // Sort so the signature is stable regardless of row order.
      const signature = lines
        .map((line) => `${line.product.id}:${line.quantity}`)
        .sort()
        .join("|");

      if (signature === lastServerSignature.current) return;
      // A local edit newer than the server snapshot wins; the next poll will
      // pick up whatever the other device did once our change has been sent.
      if (localChangeAt.current > Date.now() - 1000) return;

      lastServerSignature.current = signature;
      setItems(
        lines.map((line) => ({
          productId: line.product.id,
          quantity: Math.min(line.quantity, MAX_PER_LINE),
        })),
      );
      // Persisted by the effect above, since `ready` is already true.
    } catch {
      // Offline or a transient failure. Try again on the next tick.
    }
  }, [signedIn]);

  // The polling interval, plus the events that should trigger an immediate
  // refresh. `visible` gates the timer rather than merely clearing it, so a
  // backgrounded tab does not keep waking up.
  useEffect(() => {
    if (!signedIn) return;

    const POLL_MS = 8000;
    let timer: number | undefined;

    const start = () => {
      if (timer !== undefined) return;
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void pullFromServer();
      }, POLL_MS);
    };
    const stop = () => {
      if (timer === undefined) return;
      window.clearInterval(timer);
      timer = undefined;
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") {
        stop();
        return;
      }
      start();
      // Coming back to the tab should feel instant, not wait for the next tick.
      void pullFromServer();
    };

    // Back online after a tunnel drop or a lift in a lift: the cart may have
    // moved on the other device while we were dark.
    const onOnline = () => void pullFromServer();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    if (document.visibilityState === "visible") start();

    return () => {
      stop();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [signedIn, pullFromServer]);

  // Clear the "Added" flash after a moment.
  useEffect(() => {
    if (!justAdded) return;
    const timer = window.setTimeout(() => setJustAdded(null), 1800);
    return () => window.clearTimeout(timer);
  }, [justAdded]);

  const add = useCallback(
    (productId: string, quantity = 1) => {
      setItems((current) => {
        const existing = current.find((line) => line.productId === productId);
        return existing
          ? current.map((line) =>
              line.productId === productId
                ? {
                    ...line,
                    quantity: Math.min(line.quantity + quantity, MAX_PER_LINE),
                  }
                : line,
            )
          : [...current, { productId, quantity: Math.min(quantity, MAX_PER_LINE) }];
      });
      stampLocalChange();
      mirror({ action: "add", productId, quantity });
      setJustAdded(productId);
      setIsOpen(true);
    },
    [mirror, stampLocalChange],
  );

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      const clamped = Math.max(0, Math.min(MAX_PER_LINE, Math.trunc(quantity)));
      setItems((current) =>
        clamped === 0
          ? current.filter((line) => line.productId !== productId)
          : current.map((line) =>
              line.productId === productId ? { ...line, quantity: clamped } : line,
            ),
      );
      stampLocalChange();
      mirror(
        clamped === 0
          ? { action: "remove", productId }
          : { action: "set", productId, quantity: clamped },
      );
    },
    [mirror, stampLocalChange],
  );

  const remove = useCallback(
    (productId: string) => setQuantity(productId, 0),
    [setQuantity],
  );

  const clear = useCallback(() => {
    setItems([]);
    stampLocalChange();
    mirror({ action: "clear" });
  }, [mirror, stampLocalChange]);

  // Anything the catalogue no longer sells, or that has sold out, is dropped
  // from the rendered cart rather than being shown and then rejected.
  const lines = useMemo<CartLine[]>(() => {
    const result: CartLine[] = [];
    for (const item of items) {
      const product = index.get(item.productId);
      if (!product || product.stock < 1) continue;
      const quantity = Math.min(item.quantity, product.stock);
      if (quantity < 1) continue;
      result.push({ product, quantity, lineTotalCents: product.priceCents * quantity });
    }
    return result;
  }, [items, index]);

  const value = useMemo<CartContextValue>(
    () => ({
      ready,
      lines,
      count: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
      add,
      setQuantity,
      remove,
      clear,
      justAdded,
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [ready, lines, add, setQuantity, remove, clear, justAdded, isOpen],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used inside <CartProvider>.");
  }
  return context;
}
