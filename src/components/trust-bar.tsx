/**
 * The trust bar.
 *
 * Four reassurances the storefront reference places under the product grids.
 * Static and server-rendered - it is reassurance, not interaction, and there is
 * no reason to ship JavaScript for it.
 */
const PROMISES = [
  {
    title: "Secure payment",
    detail: "Every order priced on the server",
    icon: (
      <>
        <path d="M12 3 5 6v5c0 4.5 3 8.2 7 9.5 4-1.3 7-5 7-9.5V6Z" strokeLinejoin="round" />
        <path d="m9.5 12 1.8 1.8L15 10" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    title: "Easy returns",
    detail: "30 days, no questions asked",
    icon: (
      <>
        <path d="M4 10a8 8 0 1 1 2.3 5.7" strokeLinecap="round" />
        <path d="M4 5v5h5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    title: "Stock you can trust",
    detail: "Reserved the moment you check out",
    icon: (
      <>
        <rect x="4" y="7" width="16" height="12" rx="2" />
        <path d="M9 7V5.5A2.5 2.5 0 0 1 11.5 3h1A2.5 2.5 0 0 1 15 5.5V7" strokeLinecap="round" />
      </>
    ),
  },
  {
    title: "24/7 support",
    detail: "A human replies within a day",
    icon: (
      <>
        <path d="M4 13v-1a8 8 0 1 1 16 0v1" strokeLinecap="round" />
        <rect x="3" y="13" width="4" height="6" rx="1.6" />
        <rect x="17" y="13" width="4" height="6" rx="1.6" />
      </>
    ),
  },
];

export function TrustBar() {
  return (
    <section
      aria-label="Why shop with us"
      className="grid gap-3 rounded-card border border-ink-200 bg-ink-100 p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {PROMISES.map((promise) => (
        <div key={promise.title} className="flex items-start gap-3 px-2 py-2">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="mt-0.5 h-6 w-6 shrink-0 text-brand-500"
            aria-hidden="true"
          >
            {promise.icon}
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-900">{promise.title}</p>
            <p className="mt-0.5 text-xs text-ink-500">{promise.detail}</p>
          </div>
        </div>
      ))}
    </section>
  );
}