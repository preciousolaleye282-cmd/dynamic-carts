import { withTransaction, hasDatabase, query, queryOne } from "./db";
import { computeTotals, CURRENCY } from "./money";
import { sendOrderConfirmation, type SendResult } from "./mailer";
import { getProductsByIds } from "./queries";
import type {
  Address,
  Order,
  OrderItem,
  PaymentMethod,
  ShippingMethod,
} from "./types";
import type { CheckoutInput } from "./validation";

/**
 * Order placement.
 *
 * The whole write happens inside one transaction with the product rows locked
 * `FOR UPDATE`, which means two people checking out the last jacket at the same
 * moment cannot both succeed: the second transaction blocks, then sees the
 * updated stock and fails cleanly. Prices are re-read from the database - the
 * client only ever sends product ids and quantities, so a tampered payload
 * cannot change what anyone is charged.
 */

export class CheckoutError extends Error {
  /** Which form field to highlight, when the problem is user-fixable. */
  readonly field: string | null;
  readonly status: number;

  constructor(message: string, field: string | null = null, status = 400) {
    super(message);
    this.name = "CheckoutError";
    this.field = field;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Order numbers
// ---------------------------------------------------------------------------

const ORDER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

/** DC-XXXXXXX. Unambiguous alphabet so it survives being read aloud. */
export function generateOrderNumber(): string {
  let suffix = "";
  for (let i = 0; i < 7; i += 1) {
    suffix += ORDER_ALPHABET[Math.floor(Math.random() * ORDER_ALPHABET.length)];
  }
  return `DC-${suffix}`;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

type OrderRow = {
  id: string;
  order_number: string;
  user_id: string | null;
  email: string;
  status: string;
  payment_method: string;
  currency: string;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  discount_cents: number;
  total_cents: number;
  shipping_address: unknown;
  shipping_method: string;
  note: string | null;
  confirmation_sent_at: Date | null;
  created_at: Date;
};

type OrderItemRow = {
  id: string;
  product_id: string | null;
  name: string;
  image_url: string | null;
  slug: string | null;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
};

function mapAddress(value: unknown): Address {
  if (value === null || typeof value !== "object") {
    return { fullName: "", line1: "", line2: null, city: "", postcode: "", country: "", phone: "" };
  }
  const raw = value as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "");
  return {
    fullName: text("fullName"),
    line1: text("line1"),
    line2: text("line2") || null,
    city: text("city"),
    postcode: text("postcode"),
    country: text("country"),
    phone: text("phone"),
  };
}

function mapOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    email: row.email,
    status: row.status,
    paymentMethod: row.payment_method as PaymentMethod,
    currency: row.currency,
    subtotalCents: row.subtotal_cents,
    shippingCents: row.shipping_cents,
    taxCents: row.tax_cents,
    discountCents: row.discount_cents,
    totalCents: row.total_cents,
    shippingAddress: mapAddress(row.shipping_address),
    shippingMethod: row.shipping_method as ShippingMethod,
    note: row.note,
    confirmationSentAt: row.confirmation_sent_at ? row.confirmation_sent_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    items,
  };
}

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    imageUrl: row.image_url,
    slug: row.slug,
    unitPriceCents: row.unit_price_cents,
    quantity: row.quantity,
    lineTotalCents: row.line_total_cents,
  };
}

const ORDER_COLUMNS = `id, order_number, user_id, email, status, payment_method, currency,
  subtotal_cents, shipping_cents, tax_cents, discount_cents, total_cents,
  shipping_address, shipping_method, note, confirmation_sent_at, created_at`;

const ORDER_ITEM_COLUMNS = `id, product_id, name, image_url, slug,
  unit_price_cents, quantity, line_total_cents`;

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Demo-mode store
// ---------------------------------------------------------------------------

declare global {
  var __dynamicCartsDemoOrders: Map<string, Order> | undefined;
}

function demoOrders(): Map<string, Order> {
  if (!globalThis.__dynamicCartsDemoOrders) {
    globalThis.__dynamicCartsDemoOrders = new Map();
  }
  return globalThis.__dynamicCartsDemoOrders;
}

// ---------------------------------------------------------------------------
// Place an order
// ---------------------------------------------------------------------------

export type PlaceOrderResult = {
  order: Order;
  /** Whether the confirmation email actually left the building. */
  email: SendResult;
};

/** Collapse duplicate product ids and clamp each quantity to a sane range. */
function normaliseRequestedItems(
  items: { productId: string; quantity: number }[],
): { productId: string; quantity: number }[] {
  const wanted = new Map<string, number>();
  for (const item of items) {
    const quantity = Math.max(1, Math.min(99, Math.trunc(item.quantity)));
    wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + quantity);
  }
  return [...wanted.entries()].map(([productId, quantity]) => ({
    productId,
    quantity: Math.min(quantity, 99),
  }));
}

function toAddress(input: CheckoutInput): Address {
  return {
    fullName: input.address.fullName,
    line1: input.address.line1,
    line2: input.address.line2 || null,
    city: input.address.city,
    postcode: input.address.postcode,
    country: input.address.country,
    phone: input.address.phone,
  };
}

export async function placeOrder(
  input: CheckoutInput,
  userId: string | null,
): Promise<PlaceOrderResult> {
  const requested = normaliseRequestedItems(input.items);
  if (requested.length === 0) {
    throw new CheckoutError("Your cart is empty.", "items");
  }

  const shippingMethod = input.shippingMethod as ShippingMethod;
  const paymentMethod = input.paymentMethod as PaymentMethod;
  const address = toAddress(input);
  const note = input.note?.trim() || null;
  const ids = requested.map((item) => item.productId);

  // ---- Demo mode: no database, so assemble and store in memory -------------
  if (!hasDatabase) {
    const products = await getProductsByIds(ids);
    if (products.length !== ids.length) {
      throw new CheckoutError(
        "One of the items in your cart is no longer available.",
        "items",
        409,
      );
    }

    const items: OrderItem[] = [];
    for (const wanted of requested) {
      const product = products.find((p) => p.id === wanted.productId)!;
      if (product.stock < wanted.quantity) {
        throw new CheckoutError(
          `Only ${product.stock} left of ${product.name}. Please reduce the quantity.`,
          `items.${wanted.productId}`,
          409,
        );
      }
      items.push({
        id: `demo-item-${product.id}-${wanted.quantity}`,
        productId: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        slug: product.slug,
        unitPriceCents: product.priceCents,
        quantity: wanted.quantity,
        lineTotalCents: product.priceCents * wanted.quantity,
      });
    }

    const totals = computeTotals(
      items.map((item) => ({ priceCents: item.unitPriceCents, quantity: item.quantity })),
      shippingMethod,
    );

    const order: Order = {
      id: `demo-order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      orderNumber: generateOrderNumber(),
      userId,
      email: input.email,
      status: "confirmed",
      paymentMethod,
      currency: CURRENCY,
      subtotalCents: totals.subtotalCents,
      shippingCents: totals.shippingCents,
      taxCents: totals.taxCents,
      discountCents: totals.discountCents,
      totalCents: totals.totalCents,
      shippingAddress: address,
      shippingMethod,
      note,
      confirmationSentAt: null,
      createdAt: new Date().toISOString(),
      items,
    };

    demoOrders().set(order.orderNumber, order);
    return { order, email: await sendOrderConfirmation(order) };
  }

  // ---- Real database -------------------------------------------------------
  const order = await withTransaction(async (client) => {
    // Lock the product rows. Concurrent checkouts of the same product
    // serialise here, so the last jacket can only be sold once.
    const locked = await client.query<{
      id: string;
      name: string;
      slug: string;
      image_url: string | null;
      price_cents: number;
      stock: number;
    }>(
      `SELECT id, name, slug, image_url, price_cents, stock
         FROM products
        WHERE id = ANY($1::uuid[])
        FOR UPDATE`,
      [ids],
    );

    if (locked.rows.length !== ids.length) {
      throw new CheckoutError(
        "One of the items in your cart is no longer available.",
        "items",
        409,
      );
    }
    const byId = new Map(locked.rows.map((row) => [row.id, row]));

    // Validate every line before writing anything.
    const pricedItems = requested.map((wanted) => {
      const row = byId.get(wanted.productId)!;
      if (row.stock < wanted.quantity) {
        throw new CheckoutError(
          row.stock === 0
            ? `${row.name} has just sold out.`
            : `Only ${row.stock} left of ${row.name}. Please reduce the quantity.`,
          `items.${wanted.productId}`,
          409,
        );
      }
      return {
        productId: wanted.productId,
        name: row.name,
        slug: row.slug,
        imageUrl: row.image_url,
        unitPriceCents: row.price_cents,
        quantity: wanted.quantity,
        lineTotalCents: row.price_cents * wanted.quantity,
      };
    });

    // Authoritative totals, computed from database prices.
    const totals = computeTotals(
      pricedItems.map((item) => ({
        priceCents: item.unitPriceCents,
        quantity: item.quantity,
      })),
      shippingMethod,
    );

    // order_number has a UNIQUE constraint; retry the (very unlikely) clash
    // rather than failing somebody's checkout over it.
    let inserted: OrderRow | null = null;
    for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
      try {
        const result = await client.query<OrderRow>(
          `INSERT INTO orders (
             order_number, user_id, email, status, payment_method, currency,
             subtotal_cents, shipping_cents, tax_cents, discount_cents, total_cents,
             shipping_address, shipping_method, note)
           VALUES ($1, $2, $3, 'confirmed', $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
           RETURNING ${ORDER_COLUMNS}`,
          [
            generateOrderNumber(),
            userId,
            input.email,
            paymentMethod,
            CURRENCY,
            totals.subtotalCents,
            totals.shippingCents,
            totals.taxCents,
            totals.discountCents,
            totals.totalCents,
            JSON.stringify(address),
            shippingMethod,
            note,
          ],
        );
        inserted = result.rows[0] ?? null;
      } catch (error) {
        if ((error as { code?: string }).code === "23505" && attempt < 4) continue;
        throw error;
      }
    }
    if (!inserted) {
      throw new CheckoutError("Could not allocate an order number. Please try again.", null, 500);
    }

    // Line items, with name and price snapshotted so the invoice never changes.
    for (const item of pricedItems) {
      await client.query(
        `INSERT INTO order_items (
           order_id, product_id, name, image_url, slug,
           unit_price_cents, quantity, line_total_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          inserted.id,
          item.productId,
          item.name,
          item.imageUrl,
          item.slug,
          item.unitPriceCents,
          item.quantity,
          item.lineTotalCents,
        ],
      );
    }

    for (const wanted of requested) {
      await client.query(`UPDATE products SET stock = stock - $2 WHERE id = $1`, [
        wanted.productId,
        wanted.quantity,
      ]);
    }

    // These have been bought - drop them from the shopper's saved cart.
    if (userId) {
      await client.query(
        `DELETE FROM cart_items WHERE user_id = $1 AND product_id = ANY($2::uuid[])`,
        [userId, ids],
      );
    }

    const items: OrderItem[] = pricedItems.map((item, index) => ({
      id: `${inserted!.id}-${index}`,
      productId: item.productId,
      name: item.name,
      imageUrl: item.imageUrl,
      slug: item.slug,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      lineTotalCents: item.lineTotalCents,
    }));

    return mapOrder(inserted, items);
  });

  // Email outside the transaction: a slow SMTP call must never hold a row lock.
  const email = await sendOrderConfirmation(order);
  const confirmationSentAt = email.sent ? new Date().toISOString() : null;

  if (confirmationSentAt) {
    await query(
      `UPDATE orders
          SET confirmation_sent_at = $2, confirmation_message_id = $3
         WHERE id = $1`,
      [order.id, confirmationSentAt, email.id],
    ).catch((error) => {
      console.error("[dynamic-carts] could not record the Mailgun message id:", error);
    });
  }

  return { order: { ...order, confirmationSentAt }, email };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Look up an order for the confirmation page. When the viewer is not signed in
 * the email must match as well, so order numbers cannot be enumerated by
 * guessing.
 */
export async function getOrderForViewer(
  orderNumber: string,
  viewer: { userId: string | null; email: string | null },
): Promise<Order | null> {
  const number = orderNumber.trim().toUpperCase();
  const matchesViewer = (order: Order): boolean =>
    (viewer.userId !== null && order.userId === viewer.userId) ||
    (viewer.email !== null && order.email.toLowerCase() === viewer.email.toLowerCase());

  if (!hasDatabase) {
    const order = demoOrders().get(number);
    return order && matchesViewer(order) ? order : null;
  }

  const row = await queryOne<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE order_number = $1`,
    [number],
  );
  if (!row) return null;

  const itemRows = await query<OrderItemRow>(
    `SELECT ${ORDER_ITEM_COLUMNS} FROM order_items WHERE order_id = $1 ORDER BY id`,
    [row.id],
  );
  const order = mapOrder(row, itemRows.map(mapOrderItem));
  return matchesViewer(order) ? order : null;
}

export async function getOrdersForUser(userId: string): Promise<Order[]> {
  if (!hasDatabase) {
    return [...demoOrders().values()]
      .filter((order) => order.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const orderRows = await query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  if (orderRows.length === 0) return [];

  const itemRows = await query<OrderItemRow & { order_id: string }>(
    `SELECT oi.order_id, ${ORDER_ITEM_COLUMNS}
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE o.user_id = $1
      ORDER BY oi.id`,
    [userId],
  );

  const byOrder = new Map<string, OrderItem[]>();
  for (const row of itemRows) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push(mapOrderItem(row));
    byOrder.set(row.order_id, list);
  }

  return orderRows.map((row) => mapOrder(row, byOrder.get(row.id) ?? []));
}

