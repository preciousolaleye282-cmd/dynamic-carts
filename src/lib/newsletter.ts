import { hasDatabase, queryOne } from "./db";
import { sendMail, type SendResult } from "./mailer";
import { escapeHtml } from "./mailer-template";

/**
 * Newsletter sign-up (backlog item 1).
 *
 * The old "Join now" button was a link to the listings page, so the 10% offer
 * could not actually be claimed. This is the real thing: validate, store the
 * address with a timestamp, and send a welcome mail carrying the code.
 *
 * Subscribing twice is a success, not an error - a shopper who cannot tell
 * whether they already signed up will simply try again. What must never happen
 * is a duplicate row or a second welcome mail, so the insert is an upsert on
 * lower(email) and the mail is only sent when `welcome_sent_at` is still null.
 */

/** The offer the signup actually grants. */
export const WELCOME_DISCOUNT_PERCENT = 10;

export type SubscribeResult = {
  /** True when the address is on the list (whether it was there already). */
  ok: boolean;
  /** True when this call is what put it there. */
  created: boolean;
  /** False when there is no database to write to. */
  persisted: boolean;
  email: SendResult | null;
  /** ISO timestamp of when the address was first recorded. */
  subscribedAt: string | null;
};

type SubscriberRow = {
  id: string;
  email: string;
  subscribed_at: string | Date;
  welcome_sent_at: string | Date | null;
};

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Deliberately permissive but shaped like an address. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: string): string | null {
  const email = normaliseEmail(raw);
  if (email.length === 0) return "Enter your email address";
  if (email.length > 254) return "That email address is too long";
  if (!EMAIL_PATTERN.test(email)) return "That does not look like a valid email address";
  return null;
}

function welcomeText(email: string): string {
  return [
    "Welcome to Dynamic Carts.",
    "",
    `Thanks for signing up${email ? ` (${email})` : ""}. Here is your welcome offer:`,
    "",
    `  ${WELCOME_DISCOUNT_PERCENT}% off your first order`,
    "",
    "Paste the code WELCOME10 at checkout before you pay.",
    "",
    "What to expect from us:",
    "  - Restock alerts on the pieces you asked about",
    "  - Early access to new arrivals",
    "  - One email a week at most",
    "",
    "Unsubscribe any time - every email has a one-click link.",
    "",
    "Dynamic Carts is a demo storefront. No real payments are taken.",
  ].join("\n");
}

function welcomeHtml(email: string): string {
  const safeEmail = escapeHtml(email);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#dedee4;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <div style="background:#131317;border:1px solid #232329;border-radius:20px;padding:32px;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#ff5c1f;font-weight:700;">Welcome</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#f7f7f9;">${WELCOME_DISCOUNT_PERCENT}% off your first order</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
          Thanks for signing up${safeEmail ? ` as <strong style="color:#f7f7f9;">${safeEmail}</strong>` : ""}.
          Use the code below at checkout.
        </p>
        <div style="margin:0 0 24px;padding:18px 20px;border:1px dashed #ff5c1f;border-radius:14px;text-align:center;">
          <span style="font-size:26px;font-weight:700;letter-spacing:.08em;color:#ff5c1f;">WELCOME10</span>
        </div>
        <p style="margin:0 0 8px;font-size:14px;color:#9b9ba3;">Restock alerts, early access to new arrivals, and one email a week at most.</p>
        <p style="margin:0;font-size:12px;color:#78787f;">Dynamic Carts is a demo storefront - no real payments are taken. Every email includes a one-click unsubscribe.</p>
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Record an address and send the welcome mail.
 *
 * In demo mode (no DATABASE_URL) nothing is stored and the mail is skipped, but
 * the call still reports success so the form behaves identically - the console
 * log from `sendMail` is the record of what would have been sent.
 */
export async function subscribeToNewsletter(raw: string): Promise<SubscribeResult> {
  const email = normaliseEmail(raw);

  if (!hasDatabase) {
    return { ok: true, created: true, persisted: false, email: null, subscribedAt: null };
  }

  const existing = await queryOne<SubscriberRow>(
    `SELECT id, email, subscribed_at, welcome_sent_at
       FROM newsletter_subscribers
      WHERE lower(email) = lower($1)`,
    [email],
  );

  if (existing) {
    // Already on the list. Report the original timestamp, and only mail if the
    // first attempt somehow failed to send.
    if (existing.welcome_sent_at === null) {
      const sent = await sendWelcome(email);
      return {
        ok: true,
        created: false,
        persisted: true,
        email: sent,
        subscribedAt: toIso(existing.subscribed_at),
      };
    }
    return {
      ok: true,
      created: false,
      persisted: true,
      email: null,
      subscribedAt: toIso(existing.subscribed_at),
    };
  }

  const inserted = await queryOne<SubscriberRow & { was_inserted?: boolean }>(
    `INSERT INTO newsletter_subscribers (email, subscribed_at)
          VALUES ($1, now())
       ON CONFLICT (lower(email)) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, email, subscribed_at, (xmax = 0) AS was_inserted`,
    [email],
  );

  // A concurrent request for the same address wins the race; either way the row
  // exists now, so the shopper gets a success message.
  const wasCreated = Boolean(inserted?.was_inserted);
  const sent = wasCreated ? await sendWelcome(email) : null;

  return {
    ok: true,
    created: wasCreated,
    persisted: true,
    email: sent,
    subscribedAt: toIso(inserted?.subscribed_at ?? null),
  };
}

/** Send the 10% welcome mail and stamp the row so it is never sent twice. */
async function sendWelcome(email: string): Promise<SendResult> {
  const result = await sendMail({
    to: email,
    subject: `Your ${WELCOME_DISCOUNT_PERCENT}% welcome code: WELCOME10`,
    text: welcomeText(email),
    html: welcomeHtml(email),
  });

  if (hasDatabase && result.sent) {
    await queryOne(
      `UPDATE newsletter_subscribers
          SET welcome_sent_at = now()
        WHERE lower(email) = lower($1)
          AND welcome_sent_at IS NULL`,
      [email],
    ).catch((error) => {
      console.error("[dynamic-carts] could not stamp welcome_sent_at:", error);
    });
  }

  return result;
}