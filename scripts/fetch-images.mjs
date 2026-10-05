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

/** Unsplash serves 403 to a default fetch agent. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Curated Unsplash photo IDs (the `photo-<id>` segment of their CDN URL). Each
 * was chosen to match the product it illustrates - outerwear, tailoring, knitwear
 * and so on - rather than assigned arbitrarily.
 *
 * Every ID here was reviewed by eye after downloading. That review caught two
 * classes of mistake the descriptions alone would not have: photographs of the
 * *wrong garment* (a child in shorts standing in for the rain slicker, a denim
 * jacket for the cardigan, a bomber jacket for the blazer) and photographs with
 * a visible third-party wordmark (NIKE, Levi's, Ferragamo, ASICS). Both are
 * disqualifying for a storefront selling its own brand, so every entry below is
 * the right product with no visible logo.
 */
const PHOTOS = {
  "aurora-wool-overcoat": "photo-1539533018447-63fcce2678e3",
  "sienna-linen-blazer": "photo-1747817230321-4ad317ac0809",
  "vela-silk-wrap-dress": "photo-1567490403845-c24b9aacb6e3",
  "northwind-cable-knit": "photo-1773747310662-e7cc9e681226",
  "atlas-oxford-shirt": "photo-1761896902115-49793a359daf",
  "harbor-selvedge-denim": "photo-1770795945913-e9093b8e704e",
  "pico-rain-slicker": "photo-1527192250228-1ece59813102",
  "wren-knit-cardigan": "photo-1751326147342-42326374d334",
  "meridian-leather-tote": "photo-1624687943971-e86af76d57de",
  "solstice-shades": "photo-1511499767150-a48a237f0083",
  "cascade-trail-runner": "photo-1553098248-de32bad54944",
  "dockside-deck-sneaker": "photo-1539874202413-c1f47b33169f",
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

/**
 * Candidate photo slugs per product. Each is the trailing token of a real
 * Unsplash photo page URL (e.g. .../photos/a-woman-in-a-yellow-raincoat-12kKVMGAuH0
 * -> `12kKVMGAuH0`), taken from a web search rather than guessed - guessed slugs
 * resolve to unrelated images, which is what produced the wrong-garment art.
 *
 * These are only a fallback for PHOTOS above. A CDN id occasionally 404s even
 * though the photo is live, because /photos/<slug>/download redirects to an
 * id that images.unsplash.com will not serve directly. Keeping the slug means
 * such a photo can still be fetched rather than silently falling back to SVG.
 *
 * Selection rule: right garment, plain or unobtrusive background, and no visible
 * third-party wordmark. The overcoat and sunglasses have acceptable art already
 * and are deliberately absent.
 */
const SLUGS = {
  "sienna-linen-blazer": "9q3z6w7RhWI", // beige linen blazer on model
  "vela-silk-wrap-dress": "gK-3gtaN2SI", // beige silk wrap dress
  "northwind-cable-knit": "g3AwbdZut70", // brown knit on a hanger, white wall
  // 5PlnzMY_rBc and the other folded-shirt candidates resolved to tees and
  // retail shelving rather than an oxford, so the CDN id already in use stays.
  "harbor-selvedge-denim": "8rKvEabgwGM", // raw denim texture
  "pico-rain-slicker": "12kKVMGAuH0", // yellow rain slicker, hood up
  "wren-knit-cardigan": "tRknQ2W_0zQ", // stack of folded knitwear
  "meridian-leather-tote": "XwjrPFW7xw0", // tan leather tote on a door
  "cascade-trail-runner": "Pi8Z7Gse1rw", // white knit trainers
  "dockside-deck-sneaker": "SJTIIUkSI08", // taupe low-top sneaker
};

/**
 * Unsplash's public download route redirects to the image CDN. Used as a
 * fallback when the CDN id alone 404s - some photos are only reachable this way.
 */
async function fetchViaRedirect(slug) {
  const url = `https://unsplash.com/photos/${slug}/download?w=900`;
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`redirect HTTP ${response.status}`);

  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`redirect returned ${type || "no type"}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 2000) throw new Error("redirect returned a suspiciously small image");
  return bytes;
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
      // Some CDN ids are reachable only through the download redirect.
      const slug = SLUGS[product.slug];
      if (!slug) {
        failures.push(`${product.slug}: ${error.message}`);
        console.warn(`  FAIL ${product.slug} - ${error.message}`);
        continue;
      }

      try {
        const bytes = await fetchViaRedirect(slug);
        await writeFile(file, bytes);
        product.image_url = relative;
        downloaded += 1;
        console.log(
          `  ok   ${product.slug} (${Math.round(bytes.length / 1024)} KB, via download redirect)`,
        );
      } catch (redirectError) {
        failures.push(`${product.slug}: ${error.message}; redirect: ${redirectError.message}`);
        console.warn(`  FAIL ${product.slug} - ${redirectError.message}`);
      }
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