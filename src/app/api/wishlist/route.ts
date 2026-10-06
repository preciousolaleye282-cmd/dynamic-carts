import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getProfileBySub,
  getWishlistIds,
  mergeWishlist,
  setWishlistIds,
} from "@/lib/profiles";
import { fieldErrors, wishlistMutationSchema } from "@/lib/validation";

/**
 * The server-side wishlist, for signed-in shoppers only.
 *
 * Guests keep their wishlist in localStorage (see `src/lib/cart.tsx`) and it
 * is unioned into this table on sign-in, so hearts survive a device change as
 * soon as somebody is signed in.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ signedIn: false, productIds: [] });
  }

  const profile = await getProfileBySub(user.sub);
  if (!profile) {
    return NextResponse.json({ signedIn: true, productIds: [] });
  }

  const productIds = await getWishlistIds(profile.id);
  return NextResponse.json(
    { signedIn: true, productIds },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to save your wishlist across devices." },
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

  const parsed = wishlistMutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That wishlist change was not valid.", fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const mutation = parsed.data;

  try {
    let productIds: string[];
    switch (mutation.action) {
      case "toggle": {
        const current = new Set(await getWishlistIds(profile.id));
        if (current.has(mutation.productId)) current.delete(mutation.productId);
        else current.add(mutation.productId);
        productIds = [...current];
        await setWishlistIds(profile.id, productIds);
        break;
      }
      case "set":
        productIds = [...new Set(mutation.productIds)];
        await setWishlistIds(profile.id, productIds);
        break;
      case "clear":
        productIds = [];
        await setWishlistIds(profile.id, productIds);
        break;
      case "merge":
        productIds = await mergeWishlist(profile.id, mutation.productIds);
        break;
    }
    return NextResponse.json({ signedIn: true, productIds });
  } catch (error) {
    console.error("[dynamic-carts] wishlist mutation failed:", error);
    return NextResponse.json({ error: "Could not update your wishlist." }, { status: 500 });
  }
}
