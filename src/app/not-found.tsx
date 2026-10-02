import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink-900">
        We could not find that page
      </h1>
      <p className="mt-3 text-ink-600">
        The link may be out of date, or the product may have sold out and been retired.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/" className="btn btn-primary px-6 py-3 text-sm">
          Go home
        </Link>
        <Link href="/search" className="btn btn-ghost px-6 py-3 text-sm">
          Browse products
        </Link>
      </div>
    </div>
  );
}
