import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env, hasDatabase } from "./env";

// Re-exported so callers that already import the pool/query helpers do not
// also need a second import from ./env just to ask "is a database configured?".
export { hasDatabase };

/**
 * One Postgres pool serves BOTH Supabase and Neon.
 *
 * Both providers speak the PostgreSQL wire protocol, so there is no
 * provider-specific driver to fork. Swapping backends is a one-line change
 * to DATABASE_URL:
 *
 *   Supabase  postgres://postgres.PROJECT:PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres
 *   Neon      postgresql://USER:PASSWORD@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
 *
 * Both are TLS-only, which is why `ssl: { rejectUnauthorized: false }` is the
 * default (the hosted certificates are issued for the provider's own proxy
 * names, not for the pooled host).
 */

declare global {
  // Next.js hot-reloads modules in development; without this the pool would
  // be re-created on every edit until Postgres refuses new connections.
  var __dynamicCartsPool: Pool | undefined;
}

function createPool(): Pool {
  if (!hasDatabase) {
    throw new Error(
      "DATABASE_URL is not set. This code path should be unreachable in demo mode.",
    );
  }
  const pool = new Pool({
    connectionString: env.databaseUrl!,
    max: env.databasePoolMax,
    // Keep the connection warm enough for a serverless function reuse pattern.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
  });

  // A pool-level error (e.g. the provider drops an idle connection) must not
  // take the whole Next.js process down.
  pool.on("error", (error) => {
    console.error("[dynamic-carts] idle postgres client error:", error.message);
  });

  return pool;
}

export function getPool(): Pool {
  if (!hasDatabase) {
    throw new Error("No database configured.");
  }
  if (!globalThis.__dynamicCartsPool) {
    globalThis.__dynamicCartsPool = createPool();
  }
  return globalThis.__dynamicCartsPool;
}

/** Parameterised query. Never interpolate user input into SQL. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as never[]);
  return result.rows;
}

/** First row or null. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Run `fn` inside a transaction, committing on success and rolling back on any
 * throw. Used by checkout so a stock clash can never leave a half-written
 * order behind.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection is already broken; the pool will discard it.
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Translate Postgres error codes into messages worth showing a shopper. */
export function describeDatabaseError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case "23505":
      return "That record already exists.";
    case "23503":
      return "A referenced record is missing.";
    case "23514":
      return "A value failed a database constraint.";
    case "23502":
      return "A required field was missing.";
    case "40001":
    case "40P01":
      return "The database was busy. Please try again.";
    case "ECONNREFUSED":
    case "ENOTFOUND":
      return "Could not reach the database. Check DATABASE_URL.";
    default:
      return "A database error occurred.";
  }
}
