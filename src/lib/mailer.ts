import { env, hasMailgun } from "./env";
import { confirmationHtml, confirmationText } from "./mailer-template";
import type { Order } from "./types";

/**
 * Transactional mail through the Mailgun Messages API.
 *
 * Sent with plain `fetch` - no SDK - so there is nothing to keep in sync with
 * Mailgun's release cadence and no dependency to audit.
 *
 * When MAILGUN_* is not configured the message is written to the server log
 * instead of being sent, so you can complete an order and read exactly what
 * would have gone out before wiring up a domain.
 */

export type SendResult = {
  sent: boolean;
  /** Mailgun's message id, e.g. "<20240101.123@mg.yourdomain.com>". */
  id: string | null;
  reason: string | null;
};

export type MailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendMail(input: MailInput): Promise<SendResult> {
  if (!hasMailgun) {
    console.info(
      [
        "",
        "──────────── 📧 Mailgun not configured (email NOT sent) ────────────",
        `To:      ${input.to}`,
        `Subject: ${input.subject}`,
        "",
        input.text,
        "──────────────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return {
      sent: false,
      id: null,
      reason:
        "Mailgun is not configured. Set MAILGUN_API_KEY, MAILGUN_DOMAIN and MAILGUN_FROM.",
    };
  }

  const endpoint = `https://${env.mailgunApiHost}/v3/${encodeURIComponent(
    env.mailgunDomain!,
  )}/messages`;

  const body = new URLSearchParams({
    from: env.mailgunFrom!,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      // Mailgun HTTP API auth: the literal user "api" and your private key.
      Authorization: `Basic ${Buffer.from(`api:${env.mailgunApiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`[dynamic-carts] Mailgun error ${response.status}: ${detail}`);
    return {
      sent: false,
      id: null,
      reason: `Mailgun responded ${response.status}. ${detail.slice(0, 300)}`,
    };
  }

  const payload = (await response.json()) as { id?: string; message?: string };
  return { sent: true, id: payload.id ?? null, reason: null };
}

// ---------------------------------------------------------------------------
// Order confirmation
// ---------------------------------------------------------------------------

export async function sendOrderConfirmation(order: Order): Promise<SendResult> {
  return sendMail({
    to: order.email,
    subject: `Your Dynamic Carts order ${order.orderNumber} is confirmed`,
    text: confirmationText(order),
    html: confirmationHtml(order),
  });
}

