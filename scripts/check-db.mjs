/**
 * Diagnose a Supabase connection failure without printing the password.
 *
 * The transaction pooler (port 6543) expects the username `postgres.<ref>`, while
 * the direct/session port (5432) expects plain `postgres`. Getting that wrong
 * produces the same generic "password authentication failed" message, so this
 * tries each combination and reports which one actually authenticates.
 *
 *   node scripts/check-db.mjs
 */
import { readFile } from "node:fs/promises";
import { Client } from "pg";

const raw = await readFile(".env.local", "utf8");
const line = raw.split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
if (!line) {
  console.error("No DATABASE_URL in .env.local");
  process.exit(1);
}
const url = line.replace(/^\s*DATABASE_URL\s*=\s*/, "").replace(/^["']|["']$/g, "");

const parsed = new URL(url);
const password = decodeURIComponent(parsed.password);
// The project ref is the part of the username after "postgres.", not the
// hostname's first label (which is the region, e.g. aws-1-eu-west-1).
const userAsGiven = decodeURIComponent(parsed.username);
const ref = userAsGiven.replace(/^postgres\./, "");

const poolerUser = userAsGiven.startsWith("postgres.")
  ? userAsGiven
  : `postgres.${ref}`;

const attempts = [
  {
    label: `pooler user ${poolerUser} @ port 6543 (transaction pooler)`,
    user: poolerUser,
    port: 6543,
  },
  {
    label: `pooler user ${poolerUser} @ port 5432 (session pooler)`,
    user: poolerUser,
    port: 5432,
  },
  {
    label: "plain user postgres @ port 6543",
    user: "postgres",
    port: 6543,
  },
];

console.log(`host      : ${parsed.hostname}`);
console.log(`ref       : ${ref}`);
console.log(`password  : ${password.length} chars, shape=${[...new Set(password.replace(/[a-z]/g, "l").replace(/[A-Z]/g, "U").replace(/[0-9]/g, "9"))].join("")}\n`);

console.log(`host      : ${parsed.hostname}`);
console.log(`port      : ${parsed.port || "(default)"}`);
console.log(`ref       : ${ref}`);
console.log(`password  : ${password.length} chars\n`);

for (const attempt of attempts) {
  const client = new Client({
    host: parsed.hostname,
    port: attempt.port,
    user: attempt.user,
    password,
    database: parsed.pathname.replace(/^\//, "") || "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  try {
    await client.connect();
    const result = await client.query("select current_database() as db, version()");
    console.log(`OK   ${attempt.label}`);
    console.log(`     database=${result.rows[0].db}`);
    console.log(`     ${String(result.rows[0].version).split(" ")[0]}`);
    await client.end();
    process.exit(0);
  } catch (error) {
    console.log(`FAIL ${attempt.label}`);
    console.log(`     ${error.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

console.log("\nNone authenticated -> the password itself is wrong.");
console.log("Reset it: Supabase dashboard -> Settings -> Database -> Reset password,");
console.log("then re-copy the connection string and re-run npm run db:setup.");
process.exit(1);