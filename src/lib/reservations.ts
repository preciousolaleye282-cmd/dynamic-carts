import { randomBytes } from "node:crypto";
import { getPool, hasDatabase, withTransaction } from "./db";
import { RESERVATION_MINUTES } from "./promotions";

/**
 * Checkout stock reservations (backlog item 9).
 *
 * The brief asks checkout to show a live "prices confirmed just now" line, to
 * tell the shopper what changed if a price or availability moved, and to hold
 * stock for a visible countdown that releases it on expiry.
 *
 * The hold is a real deduction: `reserveCartForCheckout` locks the product rows
 * FOR UPDATE and decrements `stock` inside one transaction, then records what it
 * took in `stock_reservation_items`. That is what makes the guarantee true - two
 * shoppers cannot both pay for the last jacket, because the second transaction
 * blocks and then sees the updated stock.
 *
 * When a reservation is consumed by an order, or its timer runs out, the
 * quantity is credited back exactly once, guarded by `consumed_at`.
 */

export type ReservationInput = {
  productId: string;
  quantity: number;
};

export type Reservation = {
  token: string;
  expiresAt: string;
  secondsRemaining: number;
};

export class ReservationError extends Error {
  readonly field: string | null;
  readonly status: number;

  constructor(message: string, field: string | null = null, status = 409) {
    super(message);
    this.name = "ReservationError";
    this.field = field;
    this.status = status;
  }
}

function newToken(): string {
  // URL-safe and unguessable: this is the only handle a guest has on their hold.
  return randomBytes(24).toString("base64url");
}

/**
 * Take stock for `items` and return the hold.
 *
 * Throws `ReservationError` when there is not enough stock for a line, which the
 * checkout page turns into a per-item message rather than a generic failure.
 */
export async function reserveCartForCheckout(
  items: ReservationInput[],
  userId: string | null,
  email: string | null,
): Promise<Reservation> {
  if (items.length === 0) {
    throw new ReservationError("Your cart is empty", "_form", 400);
  }
  if (!hasDatabase) {
    // Demo mode: nothing to hold, but hand back a token so the checkout page's
    // countdown still runs and the flow is identical.
    const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60_000);
    return {
      token: `demo-${newToken()}`,
      expiresAt: expiresAt.toISOString(),
      secondsRemaining: RESERVATION_MINUTES * 60,
    };
  }

  return withTransaction(async (client) => {
    const ids = items.map((item) => item.productId);

    // Lock the rows we are about to decrement. SKIP LOCKED would let us skip a
    // contended row and then under-reserve, so a plain FOR UPDATE is correct:
    // we want to wait and then see the truth.
    const { rows } = await client.query<{
      id: string;
      slug: string;
      name: string;
      stock: number | string;
    }>(
      `SELECT id, slug, name, stock
         FROM products
        WHERE id = ANY($1::uuid[])
        FOR UPDATE`,
      [ids],
    );

    if (rows.length === 0) {
      throw new ReservationError("None of those products exist any more", "_form", 404);
    }

    const byId = new Map(rows.map((row) => [row.id, row]));

    // Validate the whole basket before taking anything, so the error names the
    // actual problem instead of failing part-way through the loop.
    for (const item of items) {
      const row = byId.get(item.productId);
      if (!row) {
        throw new ReservationError("One of those items is no longer available", "_form", 409);
      }
      const stock = typeof row.stock === "number" ? row.stock : Number.parseInt(row.stock, 10);
      if (stock < item.quantity) {
        throw new ReservationError(
          stock === 0
            ? `${row.name} just sold out`
            : `Only ${stock} of ${row.name} left`,
          item.productId,
          409,
        );
      }
    }

    const token = newToken();
    const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60_000);

    await client.query(
      `INSERT INTO stock_reservations (token, user_id, email, expires_at)
            VALUES ($1, $2, $3, $4)`,
      [token, userId, email, expiresAt.toISOString()],
    );
    const { rows: reservationRows } = await client.query<{ id: string }>(
      `SELECT id FROM stock_reservations WHERE token = $1`,
      [token],
    );
    const reservationId = reservationRows[0]!.id;

    for (const item of items) {
      // Decrement only where there is still enough stock. The WHERE guard makes
      // this safe even if a row somehow slipped past the lock above.
      const { rowCount } = await client.query(
        `UPDATE products
            SET stock = stock - $1
          WHERE id = $2 AND stock >= $1`,
        [item.quantity, item.productId],
      );
      if (rowCount !== 1) {
        throw new ReservationError("Somebody bought that while you were deciding", item.productId, 409);
      }

      await client.query(
        `INSERT INTO stock_reservation_items (reservation_id, product_id, quantity)
              VALUES ($1, $2, $3)`,
        [reservationId, item.productId, item.quantity],
      );
    }

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      secondsRemaining: RESERVATION_MINUTES * 60,
    };
  });
}

/**
 * Credit a reservation's stock back.
 *
 * Called when a hold is abandoned. `consumed_at` makes it idempotent: a second
 * call for the same token finds nothing to release, so stock is never returned
 * twice.
 */
export async function releaseReservation(token: string): Promise<boolean> {
  if (!hasDatabase) return false;

  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM stock_reservations
        WHERE token = $1 AND consumed_at IS NULL
        FOR UPDATE`,
      [token],
    );
    const reservation = rows[0];
    if (!reservation) return false;

    const { rows: held } = await client.query<{
      product_id: string;
      quantity: number | string;
    }>(`SELECT product_id, quantity FROM stock_reservation_items WHERE reservation_id = $1`, [
      reservation.id,
    ]);

    for (const item of held) {
      const quantity =
        typeof item.quantity === "number" ? item.quantity : Number.parseInt(item.quantity, 10);
      await client.query(`UPDATE products SET stock = stock + $1 WHERE id = $2`, [
        quantity,
        item.product_id,
      ]);
    }

    await client.query(`UPDATE stock_reservations SET consumed_at = now() WHERE id = $1`, [
      reservation.id,
    ]);
    await client.query(`DELETE FROM stock_reservation_items WHERE reservation_id = $1`, [
      reservation.id,
    ]);
    return true;
  });
}

/**
 * How long is left on a hold, in seconds.
 *
 * Null means the token is unknown, already settled, or past its expiry - all of
 * which amount to "you do not hold anything right now".
 */
export async function getReservationRemainingSeconds(token: string): Promise<number | null> {
  if (!hasDatabase) return null;

  const { rows } = await getPool().query<{ expires_at: string | Date }>(
    `SELECT expires_at FROM stock_reservations
      WHERE token = $1 AND consumed_at IS NULL`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;

  const expiresAt =
    row.expires_at instanceof Date ? row.expires_at.getTime() : Date.parse(row.expires_at);
  const remaining = Math.floor((expiresAt - Date.now()) / 1000);
  return remaining > 0 ? remaining : null;
}

/**
 * Give expired holds back.
 *
 * Called opportunistically before a new hold is taken. The database function is
 * the source of truth; this wrapper exists so callers do not need its name.
 */
export async function releaseExpiredReservations(): Promise<number> {
  if (!hasDatabase) return 0;
  const { rows } = await getPool().query<{ released: number | string }>(
    `SELECT release_expired_reservations() AS released`,
  );
  const value = rows[0]?.released ?? 0;
  return typeof value === "number" ? value : Number.parseInt(value, 10);
}