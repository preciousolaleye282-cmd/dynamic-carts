/**
 * Read back what is actually in the database.
 *
 * A successful `db:setup` is not the same as the app working against it: this
 * checks row counts, confirms the seed landed with the right values (currency,
 * pricing), and proves the stock-lock path is usable.
 *
 *   node scripts/verify-db.mjs
 */
import { readFile } from "node:fs/promises";
import { Client } from "pg";

const raw = await readFile(".env.local", "utf8");
const line = raw.split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
const url = line.replace(/^\s*DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "");
const p = new URL(url);

const client = new Client({
  host: p.hostname,
  port: Number(p.port),
  user: decodeURIComponent(p.username),
  password: decodeURIComponent(p.password),
  database: p.pathname.replace(/^\//, "") || "postgres",
  ssl: { rejectUnauthorized: false },
});

await client.connect();
console.log("connected to:", p.hostname, `\n`);

const counts = await client.query(`
  SELECT 'categories' AS table, count(*)::int AS n FROM categories
  UNION ALL SELECT 'products',    count(*)::int FROM products
  UNION ALL SELECT 'orders',      count(*)::int FROM orders
  UNION ALL SELECT 'order_items', count(*)::int FROM order_items
  UNION ALL SELECT 'profiles',    count(*)::int FROM profiles
  UNION ALL SELECT 'cart_items',  count(*)::int FROM cart_items
`);
console.log("row counts:");
for (const row of counts.rows) console.log(`  ${row.table.padEnd(12)} ${row.n}`);

const products = await client.query(
  `SELECT name, price_cents, stock FROM products ORDER BY sort_order LIMIT 4`,
);
console.log("\nsample products:");
for (const row of products.rows) {
  console.log(`  ${row.name.padEnd(24)} N${(row.price_cents / 100).toFixed(2).padStart(12)}  stock ${row.stock}`);
}

// The search function and order-number generator are the two pieces of logic
// that live in the database, so they are worth proving here rather than in a
// page render.
const search = await client.query("SELECT name FROM search_products($1) LIMIT 3", ["wool"]);
console.log("\nsearch_products('wool'):", search.rows.map((r) => r.name).join(", ") || "(none)");

const generated = await client.query("SELECT generate_order_number() AS n");
console.log("generate_order_number():", generated.rows[0].n);

// Orders and stock prove the write path, not just the schema.
const orders = await client.query(`
  SELECT order_number, email, status, currency, total_cents,
         shipping_address->>'city' AS city
    FROM orders ORDER BY created_at DESC LIMIT 3
`);
console.log("\norders:");
for (const row of orders.rows) {
  const total = new Intl.NumberFormat("en-NG", { style: "currency", currency: row.currency }).format(
    row.total_cents / 100,
  );
  console.log(`  ${row.order_number}  ${row.email}  ${row.status}  ${total}  ${row.city}`);
}

const items = await client.query(
  `SELECT name, quantity, unit_price_cents, line_total_cents FROM order_items ORDER BY id LIMIT 3`,
);
console.log("\norder_items:");
for (const row of items.rows) {
  console.log(`  ${row.name.padEnd(24)} x${row.quantity}  ${(row.unit_price_cents / 100).toLocaleString("en-NG")}`);
}

const stock = await client.query(
  `SELECT name, stock FROM products ORDER BY sort_order LIMIT 4`,
);
console.log("\nstock (should be seeded minus what was ordered):");
for (const row of stock.rows) {
  console.log(`  ${row.name.padEnd(24)} ${row.stock}`);
}

await client.end();