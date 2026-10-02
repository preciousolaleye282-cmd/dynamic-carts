"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
 * Wishlist and "recently viewed".
 *
 * Both are deliberately browser-local rather than server-side: a wishlist is a
 * short-lived shopping signal, not a durable record, and making it work without
 * an account is most of the value. Nothing here talks to the network, and both
 * stores are read lazily after mount so the server-rendered HTML never depends
 * on them (no hydration mismatch).
 */

const WISHLIST_KEY = "dc_wishlist_v1";
const RECENT_KEY = "dc_recent_v1";
const RECENT_LIMIT = 8;

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

export function ShopperProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setWishlist(readStore(WISHLIST_KEY));
    setRecent(readStore(RECENT_KEY));
    setReady(true);
  }, []);

  const toggleWishlist = useCallback((productId: string) => {
    setWishlist((current) => {
      const next = current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [productId, ...current];
      writeStore(WISHLIST_KEY, next);
      return next;
    });
  }, []);

  const clearWishlist = useCallback(() => {
    setWishlist([]);
    writeStore(WISHLIST_KEY, []);
  }, []);

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
      mirror({ action: "add", productId, quantity });
      setJustAdded(productId);
      setIsOpen(true);
    },
    [mirror],
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
      mirror(
        clamped === 0
          ? { action: "remove", productId }
          : { action: "set", productId, quantity: clamped },
      );
    },
    [mirror],
  );

  const remove = useCallback(
    (productId: string) => setQuantity(productId, 0),
    [setQuantity],
  );

  const clear = useCallback(() => {
    setItems([]);
    mirror({ action: "clear" });
  }, [mirror]);

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
