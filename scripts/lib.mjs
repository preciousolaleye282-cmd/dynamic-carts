import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Read DATABASE_URL from the environment, or from .env.local / .env. */
export async function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();

  for (const file of [".env.local", ".env"]) {
    let contents;
    try {
      contents = await readFile(join(process.cwd(), file), "utf8");
    } catch {
      // No such file - keep looking.
      continue;
    }
    for (const line of contents.split(/\r?\n/)) {
      const match = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
      if (match) return match[1].replace(/^["']|["']$/g, "");
    }
    // The file exists but has no DATABASE_URL; try the next one rather than
    // silently reporting "not found".
  }
  return null;
}

/** Both hosted providers are TLS-only; only a self-hosted Postgres opts out. */
export function sslOption() {
  return process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false };
}

/** Hide the password before a connection string reaches the console. */
export function redact(url) {
  return url.replace(/:[^:@/]*@/, ":****@");
}

export function abortWithoutUrl() {
  console.error(
    "\n  No DATABASE_URL found.\n\n" +
      "  Set it in .env.local, or pass it inline:\n" +
      "      $env:DATABASE_URL='postgres://...'; npm run db:setup\n\n" +
      "  See .env.example for Supabase and Neon connection strings.\n",
  );
  process.exit(1);
}
