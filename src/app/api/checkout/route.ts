import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { describeDatabaseError } from "@/lib/db";
import { CheckoutError, placeOrder } from "@/lib/orders";
import { getProfileBySub, saveDefaultAddress } from "@/lib/profiles";
import { checkoutSchema, fieldErrors } from "@/lib/validation";

/**
 * Place an order.
 *
 * The request carries product ids, quantities and the delivery details - never
 * prices. `placeOrder` re-reads every product inside a transaction with the rows
 * locked, so the charge is computed from the database and the stock check is
 * race-free. See src/lib/orders.ts.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  const profile = user ? await getProfileBySub(user.sub) : null;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please check the highlighted fields.",
        fields: fieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;

  // A signed-in shopper may not order to somebody else's address.
  if (user && input.email.toLowerCase() !== user.email.toLowerCase()) {
    input.email = user.email;
  }

  try {
    const { order, email } = await placeOrder(input, profile?.id ?? null);

    // "Save this address for next time" is opt-in, and only ever for the
    // signed-in shopper's own profile.
    if (profile && input.saveAddress) {
      await saveDefaultAddress(profile.id, {
        fullName: input.address.fullName,
        line1: input.address.line1,
        line2: input.address.line2 || null,
        city: input.address.city,
        postcode: input.address.postcode,
        country: input.address.country,
        phone: input.address.phone,
      }).catch((error) => {
        console.error("[dynamic-carts] could not save the address:", error);
      });
    }

    return NextResponse.json({
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
      currency: order.currency,
      emailSent: email.sent,
      // Surfaced so the UI can explain itself when Mailgun is not configured.
      emailNote: email.reason,
    });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: error.status },
      );
    }

    console.error("[dynamic-carts] checkout failed:", error);
    return NextResponse.json(
      { error: describeDatabaseError(error) },
      { status: 500 },
    );
  }
}
