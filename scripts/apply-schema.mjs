#!/usr/bin/env node
/**
 * Apply db/schema.sql to DATABASE_URL.
 *
 * The SQL is written to be re-runnable (CREATE TABLE IF NOT EXISTS, CREATE OR
 * REPLACE FUNCTION), so this is safe to run against a database that is already
 * set up - handy on Supabase, where running it from the dashboard is usually
 * easier than from a laptop.
 *
 *   npm run db:schema
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { abortWithoutUrl, readDatabaseUrl, redact, sslOption } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "db", "schema.sql");

const databaseUrl = (await readDatabaseUrl()) ?? null;
if (!databaseUrl) abortWithoutUrl();

const sql = await readFile(schemaPath, "utf8");
const client = new Client({ connectionString: databaseUrl, ssl: sslOption() });

console.log(`\n  Applying ${schemaPath}`);
console.log(`  Target: ${redact(databaseUrl)}\n`);

try {
  await client.connect();
  await client.query(sql);
  const { rows } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
  );
  console.log(`  Done. Tables now present: ${rows.map((r) => r.table_name).join(", ")}`);
  console.log("\n  Next: npm run db:seed\n");
} catch (error) {
  console.error(`\n  Failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
