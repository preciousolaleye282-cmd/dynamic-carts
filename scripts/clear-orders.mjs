#!/usr/bin/env node
/**
 * Remove demo/smoke-test orders and restore the stock they consumed.
 *
 * `npm run db:seed` refreshes the catalogue and resets stock, but it
 * deliberately leaves the `orders` table alone - real orders must survive a
 * reseed. That leaves checkout smoke-tests sitting in the database forever,
 * which is what this script is for.
 *
 *   npm run db:clear-orders              <- delete only obvious test orders
 *   npm run db:clear-orders -- --all     <- delete every order (destructive)
 *
 * Refuses to run without --all if it finds any order that does NOT look like a
 * test, so a real customer order can never be removed by a stray invocation.
 */

import { Client } from "pg";
import { abortWithoutUrl, readDatabaseUrl, redact, sslOption } from "./lib.mjs";

/** Addresses the smoke-tests and the docs use. Never a real customer. */
const TEST_EMAILS = ["real@test.com", "smoke@test.com", "test@test.com", "demo@test.com"];
/** Plus anything on an RFC 2606 reserved domain. */
const TEST_DOMAIN = /@(test|example|localhost|invalid)\.[a-z]{2,}$/i;

const deleteEverything = process.argv.includes("--all");
const databaseUrl = (await readDatabaseUrl()) ?? null;
if (!databaseUrl) abortWithoutUrl();

const client = new Client({ connectionString: databaseUrl, ssl: sslOption() });
const out = [];
const say = (line) => { out.push(line); console.log(line); };

console.log(`\n  Target: ${redact(databaseUrl)}\n`);

try {
  await client.connect();

  const { rows: orders } = await client.query(
    "SELECT id, order_number, email, status FROM orders ORDER BY created_at",
  );

  if (orders.length === 0) {
    say("  No orders to remove. Nothing to do.");
    await client.end();
    process.exit(0);
  }

  const isTest = (email) =>
    TEST_EMAILS.includes(email.toLowerCase()) || TEST_DOMAIN.test(email);

  const doomed = deleteEverything ? orders : orders.filter((o) => isTest(o.email));
  const protectedRows = orders.filter((o) => !doomed.includes(o));

  say(`  ${orders.length} order(s) found, ${doomed.length} to remove.`);
  for (const o of doomed) say(`    - ${o.order_number}  ${o.email}  (${o.status})`);

  // Refuse rather than silently deleting a real customer's order.
  if (!deleteEverything && protectedRows.length > 0) {
    console.error(
      "\n  Stopped: these orders do not look like test data, so they were kept:\n" +
        protectedRows.map((o) => `    - ${o.order_number}  ${o.email}`).join("\n") +
        "\n\n  Re-run with --all if you really mean to delete every order.\n",
    );
    await client.end();
    process.exit(1);
  }

  await client.query("BEGIN");
  try {
    // order_items has ON DELETE CASCADE, so this clears the children too.
    const { rowCount } = await client.query(
      "DELETE FROM orders WHERE id = ANY($1::uuid[])",
      [doomed.map((o) => o.id)],
    );
    await client.query("COMMIT");
    say(`\n  Removed ${rowCount} order(s).`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  // Put the stock back: the catalogue is the source of truth for demo data.
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = await readFile(join(here, "..", "db", "seed.sql"), "utf8");
  await client.query(sql);

  const { rows: totals } = await client.query(
    "SELECT (SELECT count(*) FROM orders)::int AS orders," +
    "       (SELECT count(*) FROM order_items)::int AS items," +
    "       (SELECT sum(stock)::int FROM products) AS stock",
  );
  say(`  Stock restored from db/seed.sql.`);
  say(`  Now: ${totals[0].orders} orders, ${totals[0].items} order items, ${totals[0].stock} units in stock.\n`);
} catch (error) {
  console.error(`\n  Failed: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}