"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FREE_SHIPPING_THRESHOLD_CENTS, formatCents } from "@/lib/money";

/**
 * The promo strip under the hero: a live countdown, the free-shipping nudge and
 * a new-arrivals link. Modelled on the three-up promo row in the storefront
 * reference, which uses a live timer on the first card.
 */

/**
 * The sale window rolls over on the hour. Deriving it from the clock (rather
 * than hard-coding a date) means the countdown is never stale, and the server
 * and client agree on the boundary because both use UTC hours.
 */
function secondsUntilNextHour(): number {
  const now = new Date();
  return 3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds());
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function Countdown() {
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    setSeconds(secondsUntilNextHour());
    const timer = window.setInterval(() => {
      setSeconds(secondsUntilNextHour());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Render a stable placeholder until mounted so SSR and the first client
  // render agree.
  if (seconds === null) {
    return <span className="tabular-nums">--:--:--</span>;
  }

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return (
    <span className="tabular-nums">
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

export function PromoStrip() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {/* Flash sale */}
      <Link
        href="/search?sort=price-asc"
        className="group card-surface flex flex-col justify-between gap-3 p-5 transition hover:border-brand-500"
      >
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-500">
            Flash sale
          </p>
          <p className="mt-1.5 text-sm font-semibold text-ink-900">
            Up to 30% off selected pieces
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-brand-600/15 px-2.5 py-1 font-mono text-sm font-bold text-brand-500">
            <Countdown />
          </span>
          <span className="text-xs text-ink-500 transition group-hover:text-brand-500">
            Shop now →
          </span>
        </div>
      </Link>

      {/* Free shipping */}
      <Link
        href="/search"
        className="group card-surface flex flex-col justify-between gap-3 p-5 transition hover:border-brand-500"
      >
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-500">
            Free shipping
          </p>
          <p className="mt-1.5 text-sm font-semibold text-ink-900">
            On orders over {formatCents(FREE_SHIPPING_THRESHOLD_CENTS)}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-emerald-soft px-2.5 py-1 text-xs font-semibold text-emerald-ink">
            Standard delivery
          </span>
          <span className="text-xs text-ink-500 transition group-hover:text-brand-500">
            Details →
          </span>
        </div>
      </Link>

      {/* New arrivals */}
      <Link
        href="/search?sort=newest"
        className="group card-surface flex flex-col justify-between gap-3 p-5 transition hover:border-brand-500"
      >
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-500">
            New arrivals
          </p>
          <p className="mt-1.5 text-sm font-semibold text-ink-900">
            Just landed this week
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-ink-200 px-2.5 py-1 text-xs font-semibold text-ink-700">
            Fresh stock
          </span>
          <span className="text-xs text-ink-500 transition group-hover:text-brand-500">
            Browse →
          </span>
        </div>
      </Link>
    </div>
  );
}