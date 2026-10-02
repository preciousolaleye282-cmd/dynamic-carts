
// ---------------------------------------------------------------------------
// Order confirmation template (HTML)
// ---------------------------------------------------------------------------

import { formatCents, SHIPPING_METHODS } from "./money";
import type { Order } from "./types";

/**
 * Order confirmation email bodies, kept apart from the Mailgun transport in
 * `mailer.ts` so the wording can be edited without touching HTTP code.
 */

/** Escape untrusted values before they are interpolated into the HTML email. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Plain-text alternative (every mail client renders one of the two)
// ---------------------------------------------------------------------------

export function confirmationText(order: Order): string {
  const method = SHIPPING_METHODS[order.shippingMethod] ?? SHIPPING_METHODS.standard;
  const address = order.shippingAddress;

  return [
    `Hi ${address.fullName},`,
    "",
    "Thank you for your order. We've got it and it is being prepared now.",
    "",
    `Order number: ${order.orderNumber}`,
    `Placed:       ${new Date(order.createdAt).toUTCString()}`,
    `Delivery:     ${method.label} (${method.eta})`,
    `Payment:      ${order.paymentMethod === "card" ? "Card" : "Cash on delivery"}`,
    "",
    "Items",
    "-----",
    ...order.items.map(
      (item) =>
        `${item.quantity} x ${item.name}\n` +
        `    ${formatCents(item.unitPriceCents)} each = ${formatCents(item.lineTotalCents)}`,
    ),
    "",
    `Subtotal:  ${formatCents(order.subtotalCents)}`,
    `Shipping:  ${order.shippingCents === 0 ? "Free" : formatCents(order.shippingCents)}`,
    `Tax:       ${formatCents(order.taxCents)}`,
    `Total:     ${formatCents(order.totalCents)} ${order.currency}`,
    "",
    "Shipping to",
    "-----------",
    address.fullName,
    address.line1,
    ...(address.line2 ? [address.line2] : []),
    `${address.city}, ${address.postcode}`,
    address.country,
    `Phone: ${address.phone}`,
    "",
    "Need to change something? Reply to this email quoting your order number.",
    "",
    "-- Dynamic Carts",
  ].join("\n");
}

function moneyRow(label: string, value: string, strong = false): string {
  const color = strong ? "#191713" : "#6f6a5f";
  const size = strong ? "16px" : "14px";
  const weight = strong ? "font-weight:700;" : "";
  return `
    <tr>
      <td style="padding:4px 0;color:${color};font-size:${size};${weight}">${label}</td>
      <td style="padding:4px 0;text-align:right;color:#191713;font-size:${size};${weight}">
        ${value}
      </td>
    </tr>`;
}

export function confirmationHtml(order: Order): string {
  const method = SHIPPING_METHODS[order.shippingMethod] ?? SHIPPING_METHODS.standard;
  const a = order.shippingAddress;
  const firstName = (a.fullName.trim().split(/\s+/)[0] ?? a.fullName) || "there";

  const itemRows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #ece9e2;">
          <div style="font-weight:600;color:#191713;font-size:15px;">${escapeHtml(item.name)}</div>
          <div style="color:#6f6a5f;font-size:13px;margin-top:2px;">
            Qty ${item.quantity} &middot; ${formatCents(item.unitPriceCents)} each
          </div>
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #ece9e2;text-align:right;
                   white-space:nowrap;font-weight:600;color:#191713;">
          ${formatCents(item.lineTotalCents)}
        </td>
      </tr>`,
    )
    .join("");


  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f3ee;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f5f3ee;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width:560px;background:#ffffff;border-radius:20px;
                        padding:36px 32px;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,
                        Helvetica,Arial,sans-serif;
                        box-shadow:0 1px 3px rgba(0,0,0,.06);">

            <tr><td>
              <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;
                          color:#a06a3c;font-weight:700;">Dynamic Carts</div>
              <h1 style="margin:10px 0 4px;font-size:26px;line-height:1.2;color:#191713;">
                Thanks, ${escapeHtml(firstName)}!
              </h1>
              <p style="margin:0 0 22px;color:#6f6a5f;font-size:15px;line-height:1.55;">
                Your order is confirmed. We are packing it now and will email you again
                the moment it ships.
              </p>
            </td></tr>

            <tr><td>
              <div style="background:#faf8f4;border:1px solid #ece9e2;border-radius:14px;
                          padding:18px 20px;margin-bottom:24px;">
                <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;
                            color:#8a8377;">Order number</div>
                <div style="font-size:24px;font-weight:700;color:#191713;
                            letter-spacing:.04em;margin-top:4px;">
                  ${escapeHtml(order.orderNumber)}
                </div>
                <div style="font-size:13px;color:#6f6a5f;margin-top:8px;">
                  ${escapeHtml(method.label)} delivery &middot; ${escapeHtml(method.eta)}
                </div>
              </div>
            </td></tr>

            <tr><td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${itemRows}
              </table>
            </td></tr>

            <tr><td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                     style="margin-top:12px;">
                ${moneyRow("Subtotal", formatCents(order.subtotalCents))}
                ${moneyRow("Shipping", order.shippingCents === 0 ? "Free" : formatCents(order.shippingCents))}
                ${moneyRow("Tax", formatCents(order.taxCents))}
                ${moneyRow("Total", `${formatCents(order.totalCents)} ${escapeHtml(order.currency)}`, true)}
              </table>
            </td></tr>

            <tr><td>
              <div style="margin-top:26px;padding-top:22px;border-top:1px solid #ece9e2;">
                <div style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;
                            color:#8a8377;margin-bottom:8px;">Shipping to</div>
                <div style="font-size:14px;color:#191713;line-height:1.7;">
                  ${escapeHtml(a.fullName)}<br />
                  ${escapeHtml(a.line1)}${a.line2 ? `<br />${escapeHtml(a.line2)}` : ""}<br />
                  ${escapeHtml(a.city)}, ${escapeHtml(a.postcode)}<br />
                  ${escapeHtml(a.country)}<br />
                  <span style="color:#6f6a5f;">${escapeHtml(a.phone)}</span>
                </div>
              </div>
            </td></tr>

            <tr><td>
              <p style="margin:26px 0 0;font-size:13px;color:#8a8377;line-height:1.6;">
                Need to change something? Reply to this email quoting
                <strong>${escapeHtml(order.orderNumber)}</strong>.
              </p>
            </td></tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
