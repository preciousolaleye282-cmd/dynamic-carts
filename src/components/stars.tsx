/**
 * Five stars with a fractional fill, rendered without an icon dependency.
 *
 * The filled row is clipped by an absolutely positioned overlay rather than
 * drawn star by star. Both rows must therefore keep their *natural* width: the
 * svgs and the row carry `shrink-0`, because a flex child is shrinkable by
 * default and would compress inside the narrow overlay, misaligning every star
 * after the first.
 */
export function Stars({
  rating,
  reviewCount,
  size = "sm",
}: {
  rating: number;
  reviewCount?: number;
  size?: "sm" | "md";
}) {
  const clamped = Math.max(0, Math.min(5, rating));
  const percent = (clamped / 5) * 100;
  const height = size === "sm" ? "h-3.5" : "h-4";

  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span
        className={`relative inline-block shrink-0 align-middle ${height}`}
        role="img"
        aria-label={`Rated ${clamped.toFixed(1)} out of 5`}
      >
        <StarRow className="text-ink-600" height={height} />
        <span
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${percent}%` }}
        >
          {/* Natural width preserved so the clip cuts stars, never squashes them. */}
          <span className="flex h-full shrink-0 items-center gap-0.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <StarSvg key={i} className="text-brand-500" />
            ))}
          </span>
        </span>
      </span>

      {reviewCount !== undefined && (
        <span className="shrink-0 text-xs tabular-nums leading-none text-ink-500">
          {clamped.toFixed(1)} ({reviewCount.toLocaleString("en-US")})
        </span>
      )}
    </span>
  );
}

function StarRow({ className, height }: { className: string; height: string }) {
  return (
    <span className={`flex h-full shrink-0 items-center gap-0.5 ${className}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <StarSvg key={i} />
      ))}
    </span>
  );
}

function StarSvg({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-full w-auto shrink-0 ${className}`}
      focusable="false"
    >
      <path d="M10 1.6l2.47 5.28 5.53.72-4.05 3.9 1.04 5.66L10 14.5l-4.99 2.66 1.04-5.66L2 7.6l5.53-.72L10 1.6z" />
    </svg>
  );
}
