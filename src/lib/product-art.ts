/**
 * Generated product artwork.
 *
 * Lives outside the route handler so the drawing code stays readable and
 * testable. The route just picks a palette and calls `buildProductSvg`.
 *
 * Two things it deliberately does NOT do:
 *   - pick the garment at random. Every product name describes its own
 *     silhouette, so "Pico Rain Slicker" must not render as a handbag.
 *   - animate on hover. An SVG referenced from an <img> is a static,
 *     non-interactive document by spec - there is no hover to react to. The
 *     motion here is therefore always-on and very slow, and the card-level
 *     hover scale lives in the React components where it can actually work.
 */

export type Palette = { from: string; to: string; ink: string };

const PALETTES: Record<string, Palette> = {
  women: { from: "#efe7e8", to: "#d7c8cb", ink: "#7a4a55" },
  men: { from: "#e8ecf0", to: "#c9d2da", ink: "#45586a" },
  kids: { from: "#f0eade", to: "#dbd1be", ink: "#7a6642" },
  accessories: { from: "#ebe9ee", to: "#d0ccd7", ink: "#5b5568" },
  footwear: { from: "#e6ebe8", to: "#c8d2cc", ink: "#4c6357" },
};

export const FALLBACK: Palette = { from: "#e9e9ee", to: "#cfcfd8", ink: "#4f4f5e" };

export function paletteFor(accent: string | null | undefined): Palette {
  return (accent && PALETTES[accent]) || FALLBACK;
}

/** FNV-1a, so the artwork is stable across restarts and deployments. */
export function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Shared gradients: backdrop, fabric shading, the travelling sheen, vignette. */
function defs(p: Palette): string {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${p.from}"/>
      <stop offset="100%" stop-color="${p.to}"/>
    </linearGradient>
    <linearGradient id="fabric" x1="0.1" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".95"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity=".74"/>
      <stop offset="100%" stop-color="${p.ink}" stop-opacity=".2"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="45%" stop-color="#ffffff" stop-opacity=".62"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.4" r="0.75">
      <stop offset="55%" stop-color="${p.ink}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${p.ink}" stop-opacity=".26"/>
    </radialGradient>
  </defs>`;
}
// ---------------------------------------------------------------------------
// Garments
//
// Each builder draws inside a 400x400 box, on the 108-302 band so the wordmark
// at the bottom never collides with the hem. `ink` is the palette stroke
// colour; fabric shading comes from url(#fabric).
// ---------------------------------------------------------------------------

type Shape = (ink: string) => string;

/** Rain slicker: hood, taped seam lines, snap placket. */
const slicker: Shape = (ink) => `
    <path d="M162 150 q38 -34 76 0" fill="#fff" fill-opacity=".5" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M162 150 L148 176 L140 300 h120 l-8 -124 -14 -26 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M200 158 V300" stroke="${ink}" stroke-width="4" opacity=".65"/>
    <path d="M152 196 h96 M150 236 h100" stroke="${ink}" stroke-width="2.5" stroke-dasharray="6 5" opacity=".55"/>
    <circle cx="208" cy="182" r="4" fill="${ink}"/><circle cx="208" cy="212" r="4" fill="${ink}"/><circle cx="208" cy="242" r="4" fill="${ink}"/>`;

/** Selvedge denim: waistband, fly, patch pockets, contrast stitch. */
const denim: Shape = (ink) => `
    <path d="M152 108 h96 v34 h-96 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M152 142 L160 300 h34 l6 -96 6 96 h34 l8 -158 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M200 142 V204" stroke="${ink}" stroke-width="3.5" opacity=".6"/>
    <path d="M162 160 q26 -8 30 22" fill="none" stroke="${ink}" stroke-width="3.5" opacity=".55"/>
    <path d="M238 160 q-26 -8 -30 22" fill="none" stroke="${ink}" stroke-width="3.5" opacity=".55"/>
    <path d="M158 116 h84" stroke="#f3c969" stroke-width="2.5" stroke-dasharray="7 6" opacity=".85"/>`;

/** Oxford shirt: collar, placket, buttons, yoke seam. */
const shirt: Shape = (ink) => `
    <path d="M166 116 L234 116 L246 296 L154 296 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M166 116 L146 132 L138 186 L156 192 L166 150 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M234 116 L254 132 L262 186 L244 192 L234 150 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M182 116 L200 140 L218 116" fill="#fff" fill-opacity=".5" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M200 140 V296" stroke="${ink}" stroke-width="3.5" opacity=".6"/>
    <circle cx="200" cy="176" r="4" fill="${ink}"/><circle cx="200" cy="214" r="4" fill="${ink}"/><circle cx="200" cy="252" r="4" fill="${ink}"/>
    <path d="M160 160 h80" stroke="${ink}" stroke-width="3" opacity=".4"/>`;

/** Crew knit: ribbed hem, cable panels down the body. */
const knit: Shape = (ink) => `
    <path d="M164 112 L236 112 L252 208 L232 212 L228 296 L172 296 L168 212 L148 208 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M172 296 h56" stroke="${ink}" stroke-width="6" stroke-linecap="round" opacity=".7"/>
    <path d="M182 120 q10 44 0 88 q-10 44 0 88" fill="none" stroke="${ink}" stroke-width="3" opacity=".5"/>
    <path d="M200 120 q10 44 0 88 q-10 44 0 88" fill="none" stroke="${ink}" stroke-width="3" opacity=".5"/>
    <path d="M218 120 q10 44 0 88 q-10 44 0 88" fill="none" stroke="${ink}" stroke-width="3" opacity=".5"/>
    <path d="M172 112 q28 18 56 0" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/>`;

/** Long tailored overcoat: lapels, button placket, belt. */
const coat: Shape = (ink) => `
    <path d="M200 108 L250 126 L268 300 L232 300 L228 190 L172 190 L168 300 L132 300 L150 126 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M200 108 L186 140 L200 168 L214 140 Z" fill="#fff" fill-opacity=".55" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M200 168 V300" stroke="${ink}" stroke-width="3.5" opacity=".55"/>
    <circle cx="212" cy="196" r="4.5" fill="${ink}"/><circle cx="212" cy="226" r="4.5" fill="${ink}"/><circle cx="212" cy="256" r="4.5" fill="${ink}"/>
    <path d="M136 246 h128" stroke="${ink}" stroke-width="7" stroke-linecap="round" opacity=".8"/>`;

/** Wrap dress: crossover bodice, defined waist, flared skirt. */
const dress: Shape = (ink) => `
    <path d="M172 110 L228 110 L240 200 L160 200 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M172 110 L200 152 L228 110" fill="none" stroke="${ink}" stroke-width="4.5" stroke-linejoin="round"/>
    <path d="M160 200 L240 200 L268 302 L132 302 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M158 214 q42 16 84 0" fill="none" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>
    <path d="M244 214 q22 10 14 30" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;

/** Leather tote: structured body, twin handles, top zip, clasp. */
const tote: Shape = (ink) => `
    <path d="M138 176 h124 l-10 126 h-104 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M170 176 v-22 a30 30 0 0 1 60 0 v22" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
    <path d="M138 176 h124" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
    <path d="M148 190 q52 14 104 0" fill="none" stroke="${ink}" stroke-width="2.5" stroke-dasharray="7 6" opacity=".6"/>
    <rect x="188" y="196" width="24" height="16" rx="4" fill="none" stroke="${ink}" stroke-width="4"/>`;

/** Sunglasses: two lenses, bridge, temples. */
const shades: Shape = (ink) => `
    <path d="M124 176 h60 v22 q0 34 -30 34 t-30 -34 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M216 176 h60 v22 q0 34 -30 34 t-30 -34 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M184 190 q16 -12 32 0" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
    <path d="M124 186 h-20 M276 186 h20" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
    <path d="M138 190 q8 20 24 22" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>`;

/** Trail runner: lugged outsole, rock plate, laces. */
const runner: Shape = (ink) => `
    <path d="M128 262 q4 -34 34 -46 l40 -18 q26 30 66 34 q24 4 24 30 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M124 262 h172 v26 h-172 Z" fill="#fff" fill-opacity=".7" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M130 288 l10 10 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l10 10 l10 -10 l10 10 l10 -10" fill="none" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M166 224 l30 -14 M176 240 l30 -14 M186 254 l28 -12" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;

/** Deck sneaker: vulcanised foxing stripe, canvas upper. */
const sneaker: Shape = (ink) => `
    <path d="M132 268 q6 -40 38 -52 l42 -16 q30 28 70 32 q26 4 26 30 Z" fill="url(#fabric)" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M128 268 h174 v30 h-174 Z" fill="#fff" fill-opacity=".75" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M128 278 h174" stroke="${ink}" stroke-width="2.5" opacity=".45"/>
    <path d="M172 232 l30 -12 M182 248 l30 -12 M192 262 l28 -10" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>
    <path d="M262 252 q16 4 18 16" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`;

const garment: Record<string, Shape> = { coat, dress, knit, shirt, denim, slicker, tote, shades, runner, sneaker };

/**
 * Which garment a product is, from its slug and tagline.
 *
 * Ordered most-specific first: "rain-slicker" must resolve to `slicker` before
 * the generic `coat` rule can claim it, and anything unmatched falls back to
 * the category default.
 */
const SHAPE_RULES: Array<[RegExp, keyof typeof garment]> = [
  [/slicker|rain|jacket|puffer|anorak/, "slicker"],
  [/dress|gown|skirt/, "dress"],
  [/cardigan|knit|sweater|jumper|cable/, "knit"],
  [/shirt|oxford|blouse/, "shirt"],
  [/denim|jean|trouser|chino/, "denim"],
  [/coat|overcoat|blazer|mac|trench/, "coat"],
  [/tote|bag|backpack|purse/, "tote"],
  [/shade|glass|spectacle/, "shades"],
  [/runner|trail/, "runner"],
  [/sneaker|deck|trainer|loafer/, "sneaker"],
];

const CATEGORY_DEFAULT: Record<string, keyof typeof garment> = {
  women: "dress",
  men: "shirt",
  kids: "slicker",
  accessories: "tote",
  footwear: "sneaker",
};

export function shapeFor(slug: string, tagline: string | null, category: string | null): string {
  const haystack = `${slug} ${tagline ?? ""}`.toLowerCase();
  for (const [pattern, shape] of SHAPE_RULES) {
    if (pattern.test(haystack)) return shape;
  }
  return CATEGORY_DEFAULT[category ?? ""] ?? "coat";
}

/** Motion, scoped to this document so it cannot leak into the host page. */
const MOTION = `
    <style>
      @keyframes dc-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
      @keyframes dc-sway  { 0%,100% { transform: rotate(-1.1deg) } 50% { transform: rotate(1.1deg) } }
      @keyframes dc-drift { 0% { transform: translate(0,0) } 50% { transform: translate(10px,-8px) } 100% { transform: translate(0,0) } }
      @keyframes dc-sheen { 0% { transform: translateX(-190px) } 100% { transform: translateX(430px) } }
      .dc-garment { animation: dc-float 7s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
      .dc-garment > g { animation: dc-sway 9s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 12%; }
      .dc-blob-a  { animation: dc-drift 13s ease-in-out infinite; }
      .dc-blob-b  { animation: dc-drift 17s ease-in-out infinite reverse; }
      .dc-sheen   { animation: dc-sheen 9s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .dc-garment, .dc-garment > g, .dc-blob-a, .dc-blob-b, .dc-sheen { animation: none; }
        .dc-sheen { opacity: 0; }
      }
    </style>`;

/**
 * The full SVG document for one product.
 *
 * `shape`, `glyph` and `accent` all come from the catalogue row, so the same
 * product always renders the same artwork across restarts and deployments.
 */
export function buildProductSvg({
  slug,
  name,
  tagline,
  category,
  glyph,
}: {
  slug: string;
  name: string;
  tagline: string | null;
  category: string | null;
  glyph: string;
}): string {
  const p = paletteFor(category);
  const seed = hash(slug);
  const shape = shapeFor(slug, tagline, category);

  // Blob placement is seeded, not random, so it never shifts between renders.
  const cx1 = 70 + (seed % 150);
  const cy1 = 50 + ((seed >> 3) % 140);
  const r1 = 66 + ((seed >> 5) % 64);
  const cx2 = 260 - ((seed >> 7) % 130);
  const cy2 = 350 - ((seed >> 9) % 150);
  const r2 = 56 + ((seed >> 11) % 76);
  const tilt = ((seed % 13) - 6) * 0.45;

  const words = name.split(/\s+/).slice(0, 3);
  const first = words[0] ?? name;
  const rest = words.slice(1).join(" ");

  // Two-line lockup, big word ABOVE the remainder. These baselines used to be
  // the other way round, which drew the small line through the middle of the
  // large one. With nothing to stack, the single word centres in the band.
  const firstSize = first.length > 9 ? 22 : 26;
  const firstY = rest ? 368 : 384;
  const restSize = rest.length > 16 ? 13 : 15;
  const font = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img" aria-label="${escapeXml(name)}">
  ${defs(p)}
  ${MOTION}
  <rect width="400" height="400" fill="url(#bg)"/>
  <circle class="dc-blob-a" cx="${cx1}" cy="${cy1}" r="${r1}" fill="#ffffff" fill-opacity=".4"/>
  <circle class="dc-blob-b" cx="${cx2}" cy="${cy2}" r="${r2}" fill="#ffffff" fill-opacity=".24"/>
  <g class="dc-garment">
    <ellipse cx="200" cy="316" rx="86" ry="13" fill="${p.ink}" opacity=".16"/>
    <g transform="rotate(${tilt} 200 210)">${garment[shape](p.ink)}</g>
  </g>
  <rect class="dc-sheen" x="0" y="0" width="96" height="400" fill="url(#sheen)" opacity=".5"/>
  <rect width="400" height="400" fill="url(#vignette)"/>
  <text x="200" y="52" text-anchor="middle" font-family="${font}" font-size="15" font-weight="700" letter-spacing="3" fill="${p.ink}" opacity=".7">${escapeXml(glyph.toUpperCase())}</text>
  <text x="200" y="${firstY}" text-anchor="middle" font-family="${font}" font-size="${firstSize}" font-weight="700" fill="${p.ink}">${escapeXml(first)}</text>
  ${rest ? `<text x="200" y="392" text-anchor="middle" font-family="${font}" font-size="${restSize}" fill="${p.ink}" opacity=".75">${escapeXml(rest)}</text>` : ""}
</svg>`;
}

/** A neutral tile for a slug that matches no product. */
export const NO_PRODUCT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img" aria-label="No product">
  <rect width="400" height="400" fill="#f1efec"/>
  <text x="200" y="205" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20" fill="#7d7669">No product</text>
</svg>`;
