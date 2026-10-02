/**
 * End-to-end smoke test against a RUNNING dev server.
 *
 * Places a real order through the HTTP API so the whole path is exercised -
 * validation, the transaction, the stock lock, the order write and the line
 * snapshots - rather than just the individual pieces.
 *
 *   node scripts/smoke-checkout.mjs
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const productsRes = await fetch(`${BASE}/api/products?limit=1`);
const { products } = await productsRes.json();
const product = products[0];
console.log(`ordering: ${product.name} (stock ${product.stock}) x2`);

const payload = {
  email: "smoke@test.com",
  address: {
    fullName: "Smoke Test",
    line1: "1 Test Street",
    line2: "",
    city: "Lagos",
    postcode: "100001",
    country: "Nigeria",
    phone: "5551234567",
  },
  shippingMethod: "standard",
  paymentMethod: "card",
  note: "smoke test",
  items: [{ productId: product.id, quantity: 2 }],
};

const res = await fetch(`${BASE}/api/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});

console.log(`POST /api/checkout -> ${res.status}`);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));

if (!res.ok) {
  console.error("\nCheckout failed - see the payload above.");
  process.exit(1);
}

// 2 x price + shipping + 7.5% tax, all server-computed.
const subtotal = product.priceCents * 2;
const shipping = subtotal >= 15000000 ? 0 : 600000;
const tax = Math.round((subtotal + shipping) * 0.075);
const expected = subtotal + shipping + tax;
console.log(`\nexpected total: ${expected}`);
console.log(
  data.totalCents === expected ? "MATCH - server pricing is correct" : `MISMATCH (got ${data.totalCents})`,
);
console.log(`order ${data.orderNumber}`);