#!/usr/bin/env node
/**
 * Build /sw.js from scripts/sw-source.js.
 *
 * Two things are injected at build time, both of which cannot be hard-coded in
 * the source:
 *
 *   VERSION   Bumped whenever the source changes, and included in the cache
 *             name. The activate handler deletes every cache that is not the
 *             current one, so this is the whole update mechanism - without it
 *             users would keep the first version they ever downloaded.
 *
 *   PRECACHE  The offline shell: the manifest, the icons and /offline. Built
 *             by walking .next/static so the hashed CSS/JS the shell needs is
 *             listed too. A missing file only warns - `addAll` would otherwise
 *             reject the install and cost the user offline support entirely.
 *
 *   npm run pwa:offline
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const sourcePath = join(here, "sw-source.js");
const outPath = join(root, "public", "sw.js");

/** Content hash of the source, so a change always produces a new version. */
async function versionFor(source) {
  const hash = createHash("sha256").update(source).digest("hex");
  return hash.slice(0, 12);
}

/** Every file under .next/static, as root-relative URLs. */
async function staticAssets() {
  const dir = join(root, ".next", "static");
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        out.push("/_next/static/" + full.slice(dir.length + 1).split("\\").join("/"));
      }
    }
  };
  await walk(dir);
  return out;
}

const source = await readFile(sourcePath, "utf8");
const version = await versionFor(source);
const assets = await staticAssets();

// Always precache these, whatever the build produced.
const precache = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  ...assets,
];

const built = source
  .replace("__VERSION__", version)
  .replace("__PRECACHE__", JSON.stringify(precache, null, 2));

if (built.includes("__VERSION__") || built.includes("__PRECACHE__")) {
  console.error("\n  Placeholder left unreplaced in the service worker. Aborting.\n");
  process.exit(1);
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, built, "utf8");

console.log(`  sw.js built - version ${version}, ${precache.length} precached, ${assets.length} from .next/static`);