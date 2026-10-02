#!/usr/bin/env node
/**
 * Seed the database from db/seed.sql.
 *
 * Idempotent: the SQL upserts on the unique slugs, so running it again
 * refreshes the demo catalogue without duplicating rows or touching orders.
 *
 *   npm run db:seed
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { abortWithoutUrl, readDatabaseUrl, redact, sslOption } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = join(here, "..", "db", "seed.sql");

const databaseUrl = (await readDatabaseUrl()) ?? null;
if (!databaseUrl) abortWithoutUrl();

const sql = await readFile(seedPath, "utf8");
const client = new Client({ connectionString: databaseUrl, ssl: sslOption() });

console.log(`\n  Applying ${seedPath}`);
console.log(`  Target: ${redact(databaseUrl)}\n`);

try {
  await client.connect();
  await client.query(sql);

  const { rows: productRows } = await client.query(
    "SELECT count(*)::int AS n FROM products",
  );
  const { rows: categoryRows } = await client.query(
    "SELECT count(*)::int AS n FROM categories",
  );
  console.log(
    `  Done. ${categoryRows[0].n} categories, ${productRows[0].n} products.\n`,
  );
} catch (error) {
  // The most likely cause by far: the schema was never applied.
  if (error.code === "42P01") {
    console.error("\n  Failed: the tables do not exist yet. Run `npm run db:schema` first.\n");
  } else {
    console.error(`\n  Failed: ${error.message}\n`);
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
