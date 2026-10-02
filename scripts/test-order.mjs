#!/usr/bin/env node
/**
 * Place a real order against a deployed BASE_URL and report whether Mailgun
 * accepted the confirmation.
 *
 * This is the end-to-end check for the mail pipeline: it exercises the public
 * checkout route, which calls sendOrderConfirmation() after the transaction
 * commits, and the response says plainly whether the send succeeded.
 *
 *   BASE_URL=https://dynamic-carts.vercel.app node scripts/test-order.mjs someone@example.com
 *
 * The recipient defaults to a test address. Note that a Mailgun *sandbox*
 * domain only delivers to the address registered when the sandbox was created,
 * so pass that address here or the send will be rejected.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.argv[2] ?? "smoke@test.com";

const { products } = await (await fetch(`${BASE}/api/products?limit=1`)).json();
const product = products[0];
console.log(`ordering: ${product.name} x1`);
console.log(`sending confirmation to: ${EMAIL}\n`);

const res = await fetch(`${BASE}/api/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: EMAIL,
    address: {
      fullName: "Olaleye Precious",
      line1: "12 Test Street",
      line2: "",
      city: "Lagos",
      postcode: "100001",
      country: "Nigeria",
      phone: "08012345678",
    },
    shippingMethod: "standard",
    paymentMethod: "card",
    note: "mailgun pipeline test",
    items: [{ productId: product.id, quantity: 1 }],
  }),
});

console.log(`POST ${BASE}/api/checkout -> ${res.status}`);
const data = await res.json();

if (!res.ok) {
  console.error("Checkout failed:", JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log(`order number: ${data.orderNumber}`);
console.log(`total:        ${data.totalCents}`);
console.log(`email sent:   ${data.emailSent}`);
if (data.emailNote) console.log(`email note:   ${data.emailNote}`);

console.log(
  data.emailSent
    ? "\nPASS - Mailgun accepted the message. Check the inbox."
    : "\nFAIL - the order was placed but no email was sent.",
);

const { Client } = await import("pg");
const { readDatabaseUrl, sslOption } = await import("./lib.mjs");
const db = new Client({ connectionString: await readDatabaseUrl(), ssl: sslOption() });
await db.connect();
const { rows } = await db.query(
  "SELECT order_number, confirmation_sent_at, confirmation_message_id FROM orders WHERE order_number = $1",
  [data.orderNumber],
);
console.log("\norders row:", rows[0]);
await db.end();