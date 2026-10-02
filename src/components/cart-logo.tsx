/**
 * The brand mark: a shopping cart in motion.
 *
 * The wheels roll and the cart tips forward on a loop, and the whole mark nudges
 * on hover. Motion is CSS-driven rather than JS so it costs nothing, and it is
 * suppressed entirely for anyone who has asked for reduced motion (handled by
 * the global media query in globals.css).
 */
export function CartLogo({
  className = "",
  /** Inverted = for use on the orange hero wash. */
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  const body = inverted ? "text-white" : "text-ink-900";
  const accent = inverted ? "text-white" : "text-brand-500";

  return (
    <svg
      viewBox="0 0 40 40"
      className={`logo-cart ${body} ${className}`}
      role="img"
      aria-label="Dynamic Carts"
    >
      {/* Cart body: a stroke that leans forward into the turn. */}
      <g className="logo-cart__tilt">
        <path
          d="M7 8h5.2l3.6 17.2a2.6 2.6 0 0 0 2.5 2h13.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* The basket, drawn as a wedge so it reads as "full". */}
        <path
          d="M14.4 13.2h21.2l-2.3 9.6a2.4 2.4 0 0 1-2.35 1.8H17.2Z"
          fill="currentColor"
          fillOpacity=".14"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </g>

      {/* Wheels roll while the cart is "moving". */}
      <g className={`logo-cart__wheels ${accent}`} fill="currentColor">
        <circle cx="16.5" cy="31.5" r="2.6">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 16.5 31.5"
            to="360 16.5 31.5"
            dur="1.1s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx="27.5" cy="31.5" r="2.6">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 27.5 31.5"
            to="360 27.5 31.5"
            dur="1.1s"
            repeatCount="indefinite"
          />
        </circle>
      </g>

      {/* Two speed ticks trailing the handle - the "dynamic" cue. */}
      <g className="logo-cart__speed" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M2.5 13h4" />
        <path d="M1 18h4" />
      </g>
    </svg>
  );
}