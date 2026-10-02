/**
 * Shared domain types.
 *
 * Important: the Postgres driver returns NUMERIC as a *string* to avoid
 * precision loss, so every row is normalised through the mappers in
 * `queries.ts` before it reaches this shape. Nothing in the UI ever sees a
 * stringified number.
 */

export type Category = {
  id: string;
  slug: string;
  name: string;
  glyph: string;
  accent: string;
  blurb: string | null;
  sortOrder: number;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  /** Minor units (cents). Never a float. */
  priceCents: number;
  compareAtCents: number | null;
  imageUrl: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  rating: number;
  reviewCount: number;
  stock: number;
  isFeatured: boolean;
  sortOrder: number;
};

export type CartLine = {
  product: Product;
  quantity: number;
  /** quantity * priceCents, clamped by stock. */
  lineTotalCents: number;
};

export type Address = {
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  country: string;
  phone: string;
};

export type ShippingMethod = "standard" | "express" | "overnight";

export type PaymentMethod = "card" | "cash_on_delivery";

export type Profile = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  defaultAddress: Address | null;
};

export type OrderItem = {
  id: string;
  productId: string | null;
  name: string;
  imageUrl: string | null;
  slug: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  userId: string | null;
  email: string;
  status: string;
  paymentMethod: PaymentMethod;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  shippingAddress: Address;
  shippingMethod: ShippingMethod;
  note: string | null;
  confirmationSentAt: string | null;
  createdAt: string;
  items: OrderItem[];
};

/** How the current request is authenticated. */
export type SessionUser = {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
};
