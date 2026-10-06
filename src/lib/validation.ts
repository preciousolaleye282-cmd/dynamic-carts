import { z } from "zod";
import { DEFAULT_SHIPPING_METHOD, isShippingMethod } from "./money";

/**
 * Shared, authoritative validation. The checkout form and the API route both
 * use these schemas, so a field can never be accepted in the browser and
 * rejected (or, worse, accepted) on the server.
 */

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

export const addressSchema = z.object({
  fullName: trimmed(2, 120, "Full name"),
  line1: trimmed(3, 160, "Address line 1"),
  line2: z.string().trim().max(160, "Address line 2 is too long").optional().default(""),
  city: trimmed(2, 80, "City"),
  postcode: trimmed(2, 20, "Postcode"),
  country: trimmed(2, 80, "Country"),
  // Deliberately permissive: international formats vary wildly.
  phone: z
    .string()
    .trim()
    .min(6, "Enter a contactable phone number")
    .max(32, "That phone number is too long"),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const cartItemSchema = z.object({
  productId: z.string().uuid("Invalid product"),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(99, "Maximum 99 per item"),
});

export const checkoutSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(5, "Enter your email")
    .max(254, "That email is too long")
    .email("That does not look like a valid email address"),
  address: addressSchema,
  shippingMethod: z.string().refine(isShippingMethod, "Choose a delivery option"),
  paymentMethod: z.enum(["card", "cash_on_delivery"], {
    errorMap: () => ({ message: "Choose a payment method" }),
  }),
  note: z.string().trim().max(500, "Keep notes under 500 characters").optional().default(""),
  items: z.array(cartItemSchema).min(1, "Your cart is empty"),
  /**
   * Present when the customer is signed in. Used to attach the order to the
   * profile; ignored entirely if it does not match the session.
   */
  saveAddress: z.boolean().optional().default(false),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ---------------------------------------------------------------------------
// Cart mutations
// ---------------------------------------------------------------------------

export const cartMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    productId: z.string().uuid("Invalid product"),
    quantity: z.number().int().min(1).max(99).default(1),
  }),
  z.object({
    action: z.literal("set"),
    productId: z.string().uuid("Invalid product"),
    quantity: z.number().int().min(0).max(99),
  }),
  z.object({
    action: z.literal("remove"),
    productId: z.string().uuid("Invalid product"),
  }),
  z.object({ action: z.literal("clear") }),
  /** Merges a guest's localStorage cart into the account cart after sign-in. */
  z.object({
    action: z.literal("merge"),
    items: z.array(cartItemSchema).max(100, "Too many items to merge").default([]),
  }),
]);

export type CartMutation = z.infer<typeof cartMutationSchema>;

// ---------------------------------------------------------------------------
// Wishlist mutations (a set of product ids - order never matters)
// ---------------------------------------------------------------------------

export const wishlistMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("toggle"),
    productId: z.string().uuid("Invalid product"),
  }),
  z.object({
    action: z.literal("set"),
    productIds: z.array(z.string().uuid("Invalid product")).max(200, "Too many items"),
  }),
  z.object({ action: z.literal("clear") }),
  /** Merges a guest's localStorage wishlist into the account wishlist after sign-in. */
  z.object({
    action: z.literal("merge"),
    productIds: z.array(z.string().uuid("Invalid product")).max(200, "Too many items").default([]),
  }),
]);

export type WishlistMutation = z.infer<typeof wishlistMutationSchema>;

/**
 * Flatten a ZodError into `{ "address.city": "City is required" }` so the form
 * can highlight the exact input that failed.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

export { DEFAULT_SHIPPING_METHOD };
