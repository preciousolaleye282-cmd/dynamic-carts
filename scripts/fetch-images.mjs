/**
 * Download real product photography into /public/products.
 *
 * The catalogue deliberately ships without bitmaps, so this script fetches them
 * from Unsplash's CDN and writes the resulting local paths back into
 * data/catalogue.json. It has to run on a machine with internet access - the
 * build environment used to author this store had none, which is exactly why
 * the generated SVG fallback exists.
 *
 *   node scripts/fetch-images.mjs            # fill in anything missing
 *   node scripts/fetch-images.mjs --force    # re-download everything
 *
 * The PHOTOS map below is hand-picked to match each product. To swap in your own
 * photography, drop files named "<slug>.jpg" into public/products/ and either
 * set image_url manually or re-run with --skip-existing.
 */

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "public", "products");
const cataloguePath = join(root, "data", "catalogue.json");

/**
 * Curated Unsplash photo IDs (the `photo-<id>` segment of their CDN URL). Each
 * was chosen to match the product it illustrates - outerwear, tailoring, knitwear
 * and so on - rather than assigned arbitrarily.
 */
const PHOTOS = {
  "aurora-wool-overcoat": "photo-1539533018447-63fcce2678e3",
  "sienna-linen-blazer": "photo-1591047139829-d91aecb6caea",
  "vela-silk-wrap-dress": "photo-1595777457583-95e059d581b8",
  "northwind-cable-knit": "photo-1434389677669-e08b4cac3105",
  "atlas-oxford-shirt": "photo-1602810318383-e386cc2a3ccf",
  "harbor-selvedge-denim": "photo-1542272604-787c3835535d",
  "pico-rain-slicker": "photo-1519238263530-99bdd11df2ea",
  "wren-knit-cardigan": "photo-1611312449408-fcece27cdbb7",
  "meridian-leather-tote": "photo-1590874103328-eac38a683ce7",
  "solstice-shades": "photo-1511499767150-a48a237f0083",
  "cascade-trail-runner": "photo-1542291026-7eec264c27ff",
  "dockside-deck-sneaker": "photo-1525966222134-fcfa99b8ae77",
};

const force = process.argv.includes("--force");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const raw = await readFile(cataloguePath, "utf8");
  const catalogue = JSON.parse(raw);

  let downloaded = 0;
  let skipped = 0;
  const failures = [];

  for (const product of catalogue.products) {
    const id = PHOTOS[product.slug];
    if (!id) {
      failures.push(`${product.slug}: no photo mapped`);
      continue;
    }

    const file = join(outDir, `${product.slug}.jpg`);
    const relative = `/products/${product.slug}.jpg`;

    if (!force && (await exists(file))) {
      product.image_url = relative;
      skipped += 1;
      continue;
    }

    const url = `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&h=900&q=80`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const bytes = Buffer.from(await response.arrayBuffer());
      // A 0-byte or HTML response means we were rate-limited or redirected;
      // writing that to disk would leave a permanently broken image.
      if (bytes.length < 2000) throw new Error("response too small to be an image");

      await writeFile(file, bytes);
      product.image_url = relative;
      downloaded += 1;
      console.log(`  ok   ${product.slug} (${Math.round(bytes.length / 1024)} KB)`);
    } catch (error) {
      failures.push(`${product.slug}: ${error.message}`);
      console.warn(`  FAIL ${product.slug} - ${error.message}`);
    }
  }

  await writeFile(cataloguePath, `${JSON.stringify(catalogue, null, 2)}\n`);

  console.log(`\ndownloaded: ${downloaded}   already present: ${skipped}`);
  if (failures.length > 0) {
    console.log(`problems (${failures.length}):`);
    for (const failure of failures) console.log(`  - ${failure}`);
    console.log("\nAny product left without an image falls back to the generated SVG.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});