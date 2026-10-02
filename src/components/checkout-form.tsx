"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { QuantityStepper } from "@/components/cart-drawer";
import { ProductImage } from "@/components/product-image";
import { useCart } from "@/lib/cart";
import {
  computeTotals,
  formatCents,
  FREE_SHIPPING_THRESHOLD_CENTS,
  SHIPPING_METHODS,
  TAX_RATE,
} from "@/lib/money";
import type { Address, ShippingMethod } from "@/lib/types";
import { DEFAULT_SHIPPING_METHOD, checkoutSchema } from "@/lib/validation";

type FieldErrors = Record<string, string>;

type Props = {
  signedIn: boolean;
  userEmail: string | null;
  userName: string | null;
  defaultAddress: Address | null;
};

/**
 * The checkout form.
 *
 * Everything shown here is a *preview*. The POST body carries product ids and
 * quantities only - never prices - and the server recomputes the totals while it
 * holds the stock rows locked. The field-level messages below come from the same
 * Zod schema the API route runs, so the two can never disagree.
 */
export function CheckoutForm({ signedIn, userEmail, userName, defaultAddress }: Props) {
  const cart = useCart();
  const router = useRouter();

  const [email, setEmail] = useState(userEmail ?? "");
  const [address, setAddress] = useState<AddressForm>(() => ({
    fullName: defaultAddress?.fullName ?? userName ?? "",
    line1: defaultAddress?.line1 ?? "",
    line2: defaultAddress?.line2 ?? "",
    city: defaultAddress?.city ?? "",
    postcode: defaultAddress?.postcode ?? "",
    country: defaultAddress?.country ?? "United States",
    phone: defaultAddress?.phone ?? "",
  }));
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>(
    DEFAULT_SHIPPING_METHOD,
  );
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash_on_delivery">("card");
  const [note, setNote] = useState("");
  const [saveAddress, setSaveAddress] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const items = useMemo(
    () => cart.lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
    [cart.lines],
  );

  // Preview only. The authoritative number is computed in `placeOrder`.
  const totals = useMemo(
    () =>
      computeTotals(
        cart.lines.map((line) => ({
          priceCents: line.product.priceCents,
          quantity: line.quantity,
        })),
        shippingMethod,
      ),
    [cart.lines, shippingMethod],
  );

  const update = (key: keyof AddressForm, value: string) => {
    setAddress((current) => ({ ...current, [key]: value }));
    // Clear the message for a field as soon as the shopper edits it.
    setErrors((current) => {
      if (!current[`address.${key}`]) return current;
      const next = { ...current };
      delete next[`address.${key}`];
      return next;
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    // Validate in the browser first for fast feedback. The server repeats this.
    const candidate = {
      email,
      address: {
        fullName: address.fullName,
        line1: address.line1,
        line2: address.line2 || undefined,
        city: address.city,
        postcode: address.postcode,
        country: address.country,
        phone: address.phone,
      },
      shippingMethod,
      paymentMethod,
      note: note || undefined,
      items,
      saveAddress: signedIn && saveAddress,
    };

    const parsed = checkoutSchema.safeParse(candidate);
    if (!parsed.success) {
      setErrors(flatten(parsed.error.issues));
      setFormError("Please check the highlighted fields.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...candidate,
          address: {
            fullName: address.fullName,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            postcode: address.postcode,
            country: address.country,
            phone: address.phone,
          },
        }),
      });

      const payload = (await response.json()) as {
        orderNumber?: string;
        error?: string;
        fields?: FieldErrors;
        field?: string;
        /** False when Mailgun is not configured; the order is still placed. */
        emailSent?: boolean;
      };

      if (!response.ok || !payload.orderNumber) {
        if (payload.fields) setErrors(payload.fields);
        if (payload.field) setErrors({ [payload.field]: payload.error ?? "Invalid" });
        setFormError(payload.error ?? "We could not place that order. Please try again.");
        return;
      }

      // The order is committed; the basket has served its purpose.
      cart.clear();
      router.push(
        `/order/${payload.orderNumber}?email=${encodeURIComponent(
          signedIn ? (userEmail ?? "") : email,
        )}&sent=${payload.emailSent === false ? "0" : "1"}`,
      );
    } catch {
      setFormError("Network problem - your order was not placed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!cart.ready) {
    return <p className="text-sm text-ink-400">Loading your cart…</p>;
  }

  if (cart.lines.length === 0) {
    return (
      <div className="card-surface px-6 py-16 text-center">
        <h2 className="font-semibold text-ink-900">There is nothing to check out.</h2>
        <p className="mt-1 text-sm text-ink-500">
          Add a few things to your cart and come back.
        </p>
        <Link href="/search" className="btn btn-primary mt-6 px-6 py-3 text-sm">
          Browse the catalogue
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-6">
        {formError && (
          <p
            role="alert"
            className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {formError}
          </p>
        )}

        <section className="card-surface p-5">
          <h2 className="text-base font-bold text-ink-900">Contact</h2>
          {signedIn ? (
            <p className="mt-2 text-sm text-ink-600">
              Your confirmation will go to{" "}
              <span className="font-medium text-ink-900">{userEmail}</span>.
            </p>
          ) : (
            <>
              <Field
                id="email"
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={setEmail}
                error={errors.email}
                required
              />
              <p className="mt-2 text-xs text-ink-400">
                We only use this for your order confirmation.{" "}
                <Link href="/account" className="underline hover:text-brand-700">
                  Log in with Google
                </Link>{" "}
                to use your saved details.
              </p>
            </>
          )}
        </section>

        <AddressSection address={address} update={update} errors={errors} />

        <section className="card-surface p-5">
          <h2 className="text-base font-bold text-ink-900">Delivery</h2>
          <div className="mt-3 space-y-2">
            {(Object.keys(SHIPPING_METHODS) as ShippingMethod[]).map((method) => {
              const option = SHIPPING_METHODS[method];
              // Standard is free at or over the threshold, on both sides.
              const free = method === "standard" && totals.subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS;
              const price = free ? 0 : option.priceCents;
              return (
                <label
                  key={method}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                    shippingMethod === method
                      ? "border-brand-500 bg-brand-900/40"
                      : "border-ink-200 hover:border-ink-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="shippingMethod"
                    value={method}
                    checked={shippingMethod === method}
                    onChange={() => setShippingMethod(method)}
                    className="accent-brand-600"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink-900">
                      {option.label}
                    </span>
                    <span className="block text-xs text-ink-500">{option.eta}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-ink-900">
                    {price === 0 ? "Free" : formatCents(price)}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.shippingMethod && (
            <p className="mt-2 text-sm text-red-600">{errors.shippingMethod}</p>
          )}
        </section>

        <section className="card-surface p-5">
          <h2 className="text-base font-bold text-ink-900">Payment</h2>
          <div className="mt-3 space-y-2">
            <PaymentOption
              id="card"
              title="Card"
              description="Demo only - no card is charged and no details are collected."
              checked={paymentMethod === "card"}
              onChange={() => setPaymentMethod("card")}
            />
            <PaymentOption
              id="cod"
              title="Cash on delivery"
              description="Pay the courier when your order arrives."
              checked={paymentMethod === "cash_on_delivery"}
              onChange={() => setPaymentMethod("cash_on_delivery")}
            />
          </div>
          {errors.paymentMethod && (
            <p className="mt-2 text-sm text-red-600">{errors.paymentMethod}</p>
          )}

          <div className="mt-5">
            <label htmlFor="note" className="block text-sm font-medium text-ink-800">
              Delivery note <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Gate code, safe place, where to leave it…"
              className="mt-1 w-full rounded-2xl border border-ink-200 px-4 py-2.5 text-sm outline-none focus:border-brand-500"
            />
            {errors.note && <p className="mt-1 text-sm text-red-600">{errors.note}</p>}
          </div>

          {signedIn && (
            <label className="mt-4 flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={saveAddress}
                onChange={(event) => setSaveAddress(event.target.checked)}
                className="accent-brand-600"
              />
              Save this address to my profile
            </label>
          )}
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card-surface p-5">
          <h2 className="text-base font-bold text-ink-900">
            Order summary
            <span className="ml-2 text-sm font-normal text-ink-500">
              {cart.count} item{cart.count === 1 ? "" : "s"}
            </span>
          </h2>

          <ul className="mt-4 divide-y divide-ink-100">
            {cart.lines.map((line) => (
              <li key={line.product.id} className="flex gap-3 py-3">
                <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-ink-100">
                  <ProductImage product={line.product} sizes="64px" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-sm font-medium text-ink-900">
                    {line.product.name}
                  </span>
                  <span className="mt-1 block">
                    <QuantityStepper
                      value={line.quantity}
                      max={Math.min(line.product.stock, 99)}
                      onChange={(next) => cart.setQuantity(line.product.id, next)}
                      label={line.product.name}
                    />
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-ink-900">
                  {formatCents(line.lineTotalCents)}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-1.5 border-t border-ink-200 pt-4 text-sm">
            <SummaryRow label="Subtotal" value={formatCents(totals.subtotalCents)} />
            <SummaryRow
              label="Delivery"
              value={
                totals.shippingCents === 0 ? "Free" : formatCents(totals.shippingCents)
              }
            />
            <SummaryRow
              label={`Tax (${Math.round(TAX_RATE * 100)}%)`}
              value={formatCents(totals.taxCents)}
            />
            <div className="flex items-baseline justify-between border-t border-ink-200 pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCents(totals.totalCents)}</dd>
            </div>
          </dl>

          {errors._form && <p className="mt-2 text-sm text-red-600">{errors._form}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary mt-4 w-full px-6 py-3.5 text-sm"
          >
            {submitting ? "Placing your order…" : "Place order"}
          </button>

          <p className="mt-3 text-center text-xs text-ink-400">
            Stock is re-checked and locked when you place the order.
          </p>

          {/* Trust row, from the checkout reference. */}
          <ul className="mt-4 flex items-center justify-center gap-4 border-t border-ink-200 pt-4 text-[11px] text-ink-500">
            {["Secure payment", "SSL encrypted", "Free returns"].map((item) => (
              <li key={item} className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 text-emerald-ink">
                  <path d="m5 12.5 4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </form>
  );
}

type AddressFormFields = {
  address: AddressForm;
  update: (key: keyof AddressForm, value: string) => void;
  errors: FieldErrors;
};

function AddressSection({ address, update, errors }: AddressFormFields) {
  return (
    <section className="card-surface p-5">
      <h2 className="text-base font-bold text-ink-900">Delivery address</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field
          id="fullName"
          label="Full name"
          autoComplete="name"
          value={address.fullName}
          onChange={(value) => update("fullName", value)}
          error={errors["address.fullName"]}
          required
          className="sm:col-span-2"
        />
        <Field
          id="line1"
          label="Address line 1"
          autoComplete="address-line1"
          value={address.line1}
          onChange={(value) => update("line1", value)}
          error={errors["address.line1"]}
          required
          className="sm:col-span-2"
        />
        <Field
          id="line2"
          label="Address line 2"
          autoComplete="address-line2"
          value={address.line2}
          onChange={(value) => update("line2", value)}
          error={errors["address.line2"]}
          className="sm:col-span-2"
        />
        <Field
          id="city"
          label="City"
          autoComplete="address-level2"
          value={address.city}
          onChange={(value) => update("city", value)}
          error={errors["address.city"]}
          required
        />
        <Field
          id="postcode"
          label="Postcode"
          autoComplete="postal-code"
          value={address.postcode}
          onChange={(value) => update("postcode", value)}
          error={errors["address.postcode"]}
          required
        />
        <Field
          id="country"
          label="Country"
          autoComplete="country-name"
          value={address.country}
          onChange={(value) => update("country", value)}
          error={errors["address.country"]}
          required
        />
        <Field
          id="phone"
          label="Phone"
          type="tel"
          autoComplete="tel"
          value={address.phone}
          onChange={(value) => update("phone", value)}
          error={errors["address.phone"]}
          required
        />
      </div>
    </section>
  );
}

type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  error?: string;
  required?: boolean;
  className?: string;
};

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  error,
  required = false,
  className = "",
}: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`mt-1 w-full rounded-2xl border px-4 py-2.5 text-sm outline-none transition ${
          error
            ? "border-red-300 focus:border-red-400"
            : "border-ink-200 focus:border-brand-500"
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function PaymentOption({
  id,
  title,
  description,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
        checked ? "border-brand-500 bg-brand-900/40" : "border-ink-200 hover:border-ink-300"
      }`}
    >
      <input
        type="radio"
        name="paymentMethod"
        id={id}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 accent-brand-600"
      />
      <span>
        <span className="block text-sm font-semibold text-ink-900">{title}</span>
        <span className="block text-xs text-ink-500">{description}</span>
      </span>
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-ink-600">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}


/** The address sub-form's local shape: `line2` stays a string, never null. */
type AddressForm = {
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  country: string;
  phone: string;
};

function flatten(issues: { path: (string | number)[]; message: string }[]): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.join(".") || "_form";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
