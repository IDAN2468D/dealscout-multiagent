export default function RootLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="טוען ממשק DealScout AI"
      className="space-y-6 py-4"
    >
      {/* Search bar skeleton */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-6">
        <div className="h-6 w-56 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
        <div className="mt-4 h-12 w-full animate-pulse rounded-xl bg-[var(--bg-elevated)]" />
        <div className="mt-3 flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
          <div className="h-8 w-28 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
          <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
        </div>
      </div>

      {/* Results & Stream grid skeleton */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-44 animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]"
            />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)]" />
      </div>
    </div>
  );
}
