import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductImage } from "@/components/product-image";
import { getCurrentUser } from "@/lib/auth";
import { formatCents, SHIPPING_METHODS } from "@/lib/money";
import { getOrderForViewer } from "@/lib/orders";
import { getProfileBySub } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Order confirmed" };

type Props = {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Order confirmation.
 *
 * Guests reach this page with their email in the query string; `getOrderForViewer`
 * only returns the order when the signed-in account owns it or the email matches,
 * so order numbers cannot be walked.
 */
export default async function ConfirmationPage({ params, searchParams }: Props) {
  const { orderNumber } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();

  // Orders are keyed to the *profile* id, not Google's `sub`, so resolve it
  // before the ownership check. Failures fall through to a null, which simply
  // means the order is not shown.
  const profile = user ? await getProfileBySub(user.sub) : null;

  const emailParam = query.email;
  const email = Array.isArray(emailParam) ? emailParam[0] : emailParam;

  const order = await getOrderForViewer(decodeURIComponent(orderNumber), {
    userId: profile?.id ?? null,
    // A signed-in shopper already proves ownership; guests must supply the email.
    email: user ? null : (email ?? null),
  });

  if (!order) notFound();

  const method = SHIPPING_METHODS[order.shippingMethod] ?? SHIPPING_METHODS.standard;
  const emailSent = query.sent !== "0";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="text-center">
        <span
          className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-soft text-emerald-ink"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
            <path
              d="m5 12.5 4.5 4.5L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-900">
          Thank you - your order is confirmed
        </h1>
        <p className="mt-2 text-ink-600">
          Order{" "}
          <span className="font-mono font-semibold text-ink-900">{order.orderNumber}</span> was
          placed on{" "}
          {new Date(order.createdAt).toLocaleDateString("en-US", { dateStyle: "long" })}.
        </p>
      </header>

      <p
        className={`rounded-card px-4 py-3 text-sm ${
          emailSent
            ? "border border-emerald-200 bg-emerald-soft text-emerald-ink"
            : "border border-amber-200 bg-amber-soft text-amber-ink"
        }`}
      >
        {emailSent ? (
          <>A confirmation email is on its way to {order.email}.</>
        ) : (
          <>
            The order was placed, but the confirmation email could not be sent because
            Mailgun is not configured. Your order number above is all you need.
          </>
        )}
      </p>

      <section className="card-surface p-5">
        <h2 className="text-base font-bold text-ink-900">Items</h2>
        <ul className="mt-4 divide-y divide-ink-100">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 py-3">
              <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-ink-100">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    width={64}
                    height={64}
                    className="h-full w-full object-cover"
                  />
                ) : item.slug ? (
                  <ProductImage
                    product={{ name: item.name, imageUrl: null, slug: item.slug }}
                    sizes="64px"
                  />
                ) : null}
              </span>

              <span className="min-w-0 flex-1">
                {item.slug ? (
                  <Link
                    href={`/product/${item.slug}`}
                    className="line-clamp-2 text-sm font-medium text-ink-900 hover:text-brand-700"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <span className="line-clamp-2 text-sm font-medium text-ink-900">
                    {item.name}
                  </span>
                )}
                <span className="mt-0.5 block text-xs text-ink-500">
                  {item.quantity} &times; {formatCents(item.unitPriceCents)}
                </span>
              </span>

              <span className="text-sm font-semibold tabular-nums text-ink-900">
                {formatCents(item.lineTotalCents)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1.5 border-t border-ink-200 pt-4 text-sm">
          <Row label="Subtotal" value={formatCents(order.subtotalCents)} />
          <Row
            label={`Delivery (${method.label})`}
            value={order.shippingCents === 0 ? "Free" : formatCents(order.shippingCents)}
          />
          <Row label="Tax" value={formatCents(order.taxCents)} />
          {order.discountCents > 0 && (
            <Row label="Discount" value={`-${formatCents(order.discountCents)}`} />
          )}
          <div className="flex items-baseline justify-between border-t border-ink-200 pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatCents(order.totalCents)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold text-ink-900">Delivering to</h2>
          <address className="mt-2 text-sm not-italic leading-relaxed text-ink-600">
            {order.shippingAddress.fullName}
            <br />
            {order.shippingAddress.line1}
            {order.shippingAddress.line2 && (
              <>
                <br />
                {order.shippingAddress.line2}
              </>
            )}
            <br />
            {order.shippingAddress.city}, {order.shippingAddress.postcode}
            <br />
            {order.shippingAddress.country}
            <br />
            {order.shippingAddress.phone}
          </address>
        </section>

        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold text-ink-900">Delivery</h2>
          <p className="mt-2 text-sm text-ink-600">
            {method.label} &middot; {method.eta}
          </p>
          <p className="mt-1 text-sm text-ink-600">
            {order.paymentMethod === "card"
              ? "Card payment (demo - nothing was charged)"
              : "Cash on delivery"}
          </p>
          <p className="mt-1 text-xs uppercase tracking-wide text-ink-400">
            Status: {order.status}
          </p>
        </section>
      </div>

      {order.note && (
        <section className="card-surface p-5">
          <h2 className="text-sm font-semibold text-ink-900">Your note</h2>
          <p className="mt-2 text-sm text-ink-600">{order.note}</p>
        </section>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/search" className="btn btn-primary px-6 py-3 text-sm">
          Continue shopping
        </Link>
        {user && (
          <Link href="/account" className="btn btn-ghost px-6 py-3 text-sm">
            View your orders
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-ink-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
