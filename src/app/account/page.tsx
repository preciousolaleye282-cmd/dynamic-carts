import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasDatabase, hasGoogleAuth } from "@/lib/env";
import { formatCents, SHIPPING_METHODS } from "@/lib/money";
import { getOrdersForUser } from "@/lib/orders";
import { getProfileBySub } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your account" };

/**
 * The account page: sign in state, saved address, and past orders. Everything
 * below the header needs a signed-in shopper, so unauthenticated visitors are
 * sent to /login rather than shown an empty shell.
 */
export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const profile = await getProfileBySub(user.sub);
  const orders = profile ? await getOrdersForUser(profile.id) : [];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-brand-100 text-lg font-bold text-brand-700">
            {user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.picture}
                alt=""
                width={56}
                height={56}
                className="h-full w-full object-cover"
              />
            ) : (
              (user.name ?? user.email).slice(0, 1).toUpperCase()
            )}
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-900">
              {profile?.fullName ?? user.name ?? "Your account"}
            </h1>
            <p className="text-sm text-ink-500">{user.email}</p>
          </div>
        </div>

        <form action="/api/auth/logout" method="post">
          <button type="submit" className="btn btn-ghost px-4 py-2.5 text-sm">
            Sign out
          </button>
        </form>
      </header>

      {!hasDatabase && (
        <Notice tone="amber">
          <strong className="font-semibold">Demo mode.</strong> Accounts and carts are kept
          in memory, so they disappear when the server restarts. Set{" "}
          <code className="rounded bg-ink-200 px-1 py-0.5 text-xs">DATABASE_URL</code> to
          persist them.
        </Notice>
      )}

      <section className="card-surface p-5">
        <h2 className="text-base font-bold text-ink-900">Default delivery address</h2>
        {profile?.defaultAddress ? (
          <address className="mt-2 text-sm not-italic leading-relaxed text-ink-600">
            {profile.defaultAddress.fullName}
            <br />
            {profile.defaultAddress.line1}
            {profile.defaultAddress.line2 && (
              <>
                <br />
                {profile.defaultAddress.line2}
              </>
            )}
            <br />
            {profile.defaultAddress.city}, {profile.defaultAddress.postcode}
            <br />
            {profile.defaultAddress.country}
            <br />
            {profile.defaultAddress.phone}
          </address>
        ) : (
          <p className="mt-2 text-sm text-ink-500">
            No address saved yet. Tick &ldquo;save this address&rdquo; during checkout and it
            will appear here.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight text-ink-900">Order history</h2>

        {orders.length === 0 ? (
          <div className="card-surface mt-4 px-6 py-12 text-center">
            <p className="font-semibold text-ink-900">No orders yet.</p>
            <p className="mt-1 text-sm text-ink-500">
              When you place an order it will show up here.
            </p>
            <Link href="/search" className="btn btn-primary mt-6 px-6 py-3 text-sm">
              Start shopping
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {orders.map((order) => {
              const method =
                SHIPPING_METHODS[order.shippingMethod] ?? SHIPPING_METHODS.standard;
              return (
                <li key={order.id} className="card-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/order/${order.orderNumber}`}
                        className="font-mono text-sm font-semibold text-brand-700 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <p className="mt-1 text-sm text-ink-500">
                        {new Date(order.createdAt).toLocaleDateString("en-US", {
                          dateStyle: "medium",
                        })}{" "}
                        &middot; {order.items.length} item
                        {order.items.length === 1 ? "" : "s"} &middot; {method.label}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold tabular-nums text-ink-900">
                        {formatCents(order.totalCents)}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-ink-400">
                        {order.status}
                      </p>
                    </div>
                  </div>

                  <ul className="mt-4 flex flex-wrap gap-2">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-full bg-ink-100 px-3 py-1 text-xs text-ink-600"
                      >
                        {item.name} &times; {item.quantity}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(!hasGoogleAuth || !hasDatabase) && <DemoStatus />}
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "amber" | "ink";
  children: React.ReactNode;
}) {
  const styles =
    tone === "amber"
      ? "border-amber-soft bg-amber-soft text-amber-ink"
      : "border-ink-200 bg-ink-100 text-ink-600";
  return (
    <div className={`rounded-card border px-4 py-3 text-sm ${styles}`}>{children}</div>
  );
}

function DemoStatus() {
  return (
    <section className="card-surface p-5">
      <h2 className="text-sm font-semibold text-ink-900">What is switched on right now</h2>
      <ul className="mt-2 space-y-1 text-sm text-ink-600">
        <li>Database: {hasDatabase ? "connected" : "demo (in-memory)"}</li>
        <li>Google sign-in: {hasGoogleAuth ? "configured" : "not configured"}</li>
        <li>
          Mailgun confirmations:{" "}
          {process.env.MAILGUN_API_KEY ? "configured" : "not configured"}
        </li>
      </ul>
    </section>
  );
}
