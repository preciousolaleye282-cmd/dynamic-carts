/**
 * Percent-encode the password inside DATABASE_URL.
 *
 * Supabase auto-generates project passwords that routinely contain characters
 * which are reserved in a URL - notably `[` and `]`, which a URL parser reads as
 * the start of an IPv6 host literal. That silently corrupts the credentials and
 * surfaces as "password authentication failed", even though the password is
 * correct.
 *
 *   node scripts/fix-db-url.mjs
 *
 * Safe to run more than once: existing %XX escapes are left alone.
 */
import { readFile, writeFile } from "node:fs/promises";

const FILE = ".env.local";
const RESERVED = /[?#[\]@]/g;

function encodePassword(url) {
  const schemeEnd = url.indexOf("://");
  if (schemeEnd === -1) return url;
  const afterScheme = schemeEnd + 3;

  // The last '@' separates userinfo from host; anything after it is host/path.
  const at = url.lastIndexOf("@");
  if (at === -1 || at < afterScheme) return url;

  const userinfo = url.slice(afterScheme, at);
  const hostPart = url.slice(at);
  const colon = userinfo.indexOf(":");
  if (colon === -1) return url;

  const user = userinfo.slice(0, colon);
  const password = userinfo.slice(colon + 1);
  const encoded = password.replace(/%(?![0-9A-Fa-f]{2})/g, "%25").replace(RESERVED, (ch) =>
    encodeURIComponent(ch),
  );

  return `${url.slice(0, afterScheme)}${user}:${encoded}${hostPart}`;
}

const original = await readFile(FILE, "utf8");
let changed = false;

const updated = original.replace(/^(\s*DATABASE_URL\s*=\s*)(.*)$/m, (line, prefix, value) => {
  const quote = value.trim().startsWith('"') ? '"' : "";
  const raw = value.trim().replace(/^["']|["']$/g, "");
  const next = encodePassword(raw);
  if (next !== raw) changed = true;
  return `${prefix}${quote}${next}${quote}`;
});

if (!changed) {
  console.log("DATABASE_URL needed no changes.");
} else {
  await writeFile(FILE, updated);
  console.log("DATABASE_URL password encoded.");
}