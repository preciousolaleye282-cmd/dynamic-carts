import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  clearCart,
  getCart,
  getCartQuantities,
  getProfileBySub,
  mergeCart,
  setCartItem,
} from "@/lib/profiles";
import { cartMutationSchema, fieldErrors } from "@/lib/validation";

/**
 * The server-side cart, for signed-in shoppers only.
 *
 * Guests keep their cart in localStorage (see `src/lib/cart.tsx`) and it is
 * merged into this table on sign-in, so a cart survives a device change as
 * soon as somebody is signed in. Every route re-derives product data from the
 * catalogue, so a client can never set its own price.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ signedIn: false, lines: [], count: 0 });
  }

  const profile = await getProfileBySub(user.sub);
  if (!profile) {
    return NextResponse.json({ signedIn: true, lines: [], count: 0 });
  }

  const lines = await getCart(profile.id);
  return NextResponse.json(
    { signedIn: true, lines, count: lines.reduce((n, line) => n + line.quantity, 0) },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to save your cart across devices." },
      { status: 401 },
    );
  }

  const profile = await getProfileBySub(user.sub);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = cartMutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That cart change was not valid.", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const mutation = parsed.data;

  try {
    switch (mutation.action) {
      case "add": {
        const current = await getCartQuantities(profile.id);
        const next = Math.min((current.get(mutation.productId) ?? 0) + mutation.quantity, 99);
        await setCartItem(profile.id, mutation.productId, next);
        break;
      }
      case "set":
        await setCartItem(profile.id, mutation.productId, mutation.quantity);
        break;
      case "remove":
        await setCartItem(profile.id, mutation.productId, 0);
        break;
      case "clear":
        await clearCart(profile.id);
        break;
      case "merge":
        await mergeCart(profile.id, mutation.items);
        break;
    }
  } catch (error) {
    console.error("[dynamic-carts] cart mutation failed:", error);
    return NextResponse.json({ error: "Could not update your cart." }, { status: 500 });
  }

  const lines = await getCart(profile.id);
  return NextResponse.json({
    signedIn: true,
    lines,
    count: lines.reduce((n, line) => n + line.quantity, 0),
  });
}
