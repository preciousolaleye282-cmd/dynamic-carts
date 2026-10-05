#!/usr/bin/env node
/**
 * Generate the PWA icon set into public/icons/.
 *
 * Writes real PNGs with no image dependencies: Next.js already bundles
 * `sharp`, so it is used rather than adding a package. The mark is rasterised
 * from an inline SVG of the brand cart, which keeps the icon in step with
 * cart-logo.tsx instead of drifting into a separate hand-drawn asset.
 *
 *   npm run icons
 *
 * Sizes follow what the browsers actually ask for:
 *   - 192 / 512          the `any` icons Chrome reads for the install prompt
 *   - 512 maskable       Android crops to whatever shape it likes, so the art
 *                        is inset to survive a circular mask
 *   - 180 apple-touch    iOS home screen; iOS never reads the manifest
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "icons");

const INK_50 = "#0a0a0b";
const INK_100 = "#131317";
const BRAND_500 = "#ff5c1f";

/**
 * The icon. `inset` shrinks the art towards the centre so a maskable icon
 * survives being cut into a circle - anything outside the safe zone would be
 * clipped away.
 */
function iconSvg({ background, inset }) {
  const scale = inset ? 1 - inset : 1;
  const offset = (40 * (1 - scale)) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 40 40">
  <rect width="40" height="40" fill="${background}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 8h5.2l3.6 17.2a2.6 2.6 0 0 0 2.5 2h13.4" stroke="#f7f7f9" stroke-width="2.4"/>
    <path d="M14.4 13.2h21.2l-2.3 9.6a2.4 2.4 0 0 1-2.35 1.8H17.2Z" fill="#f7f7f9" fill-opacity=".14" stroke="#f7f7f9" stroke-width="2.2"/>
    <g fill="${BRAND_500}">
      <circle cx="16.5" cy="31.5" r="2.6"/>
      <circle cx="27.5" cy="31.5" r="2.6"/>
    </g>
    <g stroke="#f7f7f9" stroke-width="2">
      <path d="M2.5 13h4"/>
      <path d="M1 18h4"/>
    </g>
  </g>
</svg>`;
}

const TARGETS = [
  { file: "icon-192.png", size: 192, background: INK_100, inset: 0, purpose: "any" },
  { file: "icon-512.png", size: 512, background: INK_100, inset: 0, purpose: "any" },
  // Maskable: art pulled well inside so a circular mask never clips it.
  { file: "icon-maskable-512.png", size: 512, background: BRAND_500, inset: 0.22, purpose: "maskable" },
  { file: "apple-touch-icon.png", size: 180, background: INK_100, inset: 0.04, purpose: "any" },
  // Favicon, so a browser tab is not the default globe.
  { file: "favicon-32.png", size: 32, background: INK_100, inset: 0.04, purpose: "any" },
];

async function main() {
  await mkdir(outDir, { recursive: true });

  let sharp;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch {
    console.error(
      "\n  sharp is not available.\n" +
        "  It ships with Next.js, so run `npm install` first to restore it.\n",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n  Writing icons to ${outDir}`);

  for (const target of TARGETS) {
    const svg = iconSvg({ background: target.background, inset: target.inset });
    const png = await sharp(Buffer.from(svg)).resize(target.size, target.size).png().toBuffer();
    await writeFile(join(outDir, target.file), png);
    console.log(
      `  ${target.file.padEnd(24)} ${String(target.size).padStart(3)}px  ${target.purpose.padEnd(9)} ${(png.length / 1024).toFixed(1)}KB`,
    );
  }

  console.log("\n  Done.\n");
}

await main();