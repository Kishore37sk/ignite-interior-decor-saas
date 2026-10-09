function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-sunken ${className}`} />;
}

/** Generic page skeleton shown while an (app) route segment loads. */
export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <Block className="h-7 w-56" />
        <Block className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border-soft bg-white">
            <div className="space-y-3 p-5">
              <Block className="h-4 w-28" />
              <Block className="h-8 w-20" />
            </div>
            <div className="h-11 bg-soft/70" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border-soft bg-white p-5">
        <Block className="mb-5 h-5 w-40" />
        <Block className="mb-3 h-10 w-full" />
        {Array.from({ length: 6 }, (_, i) => (
          <Block key={i} className="mb-3 h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
