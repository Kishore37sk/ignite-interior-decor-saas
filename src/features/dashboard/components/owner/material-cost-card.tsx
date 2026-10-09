import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { CurrencyText } from "@/components/shared/currency-text";
import { Badge } from "@/components/ui/badge";
import { formatINR, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MaterialCostCardProps = {
  estimated: number;
  approved: number;
  actual: number;
  /** Like-for-like variance: actual − estimate over the items that have an actual cost. */
  variance: number;
  /** Estimate of those same items (denominator of the variance %). */
  varianceBasis: number;
  className?: string;
};

/**
 * Material cost overview (app.md §23): estimated / approved / actual with the variance
 * (actual − estimated over the billed items, so open requests don't mask overruns).
 * Overruns are highlighted in red.
 */
export function MaterialCostCard({ estimated, approved, actual, variance, varianceBasis, className }: MaterialCostCardProps) {
  const hasCosts = estimated > 0 || approved > 0 || actual > 0;
  const overrun = variance > 0 && actual > 0;
  const variancePct = varianceBasis > 0 ? (Math.abs(variance) / varianceBasis) * 100 : null;
  const spentPct = estimated > 0 ? Math.min(100, (actual / estimated) * 100) : actual > 0 ? 100 : 0;
  const approvedPct = estimated > 0 ? Math.min(100, (approved / estimated) * 100) : 0;

  const figures = [
    { label: "Estimated", value: estimated, swatch: "bg-soft-strong" },
    { label: "Approved", value: approved, swatch: "bg-brand" },
    { label: "Actual", value: actual, swatch: overrun ? "bg-danger" : "bg-deep" },
  ] as const;

  return (
    <section
      aria-labelledby="material-cost-title"
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface shadow-card",
        overrun ? "border-danger/30" : "border-border-soft",
        className,
      )}
    >
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="material-cost-title" className="text-sm font-medium text-muted">
              Material Cost
            </h2>
            <p className="mt-1 text-xs text-muted">Across all active material requests</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {hasCosts && actual > 0 ? (
              <Badge tone={overrun ? "danger" : "success"} appearance="soft" size="md">
                {overrun ? <TrendingUp aria-hidden="true" /> : <TrendingDown aria-hidden="true" />}
                {overrun ? "+" : variance < 0 ? "−" : ""}
                {formatINR(Math.abs(variance), { compact: true })}
                {variancePct !== null ? ` (${formatPercent(variancePct, variancePct < 10 ? 1 : 0)})` : ""}
                <span className="sr-only">{overrun ? " over estimate" : " under estimate"}</span>
              </Badge>
            ) : null}
            <Link
              href="/reports?tab=materials"
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary-strong transition-colors hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Material report
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {figures.map((figure) => (
            <div key={figure.label} className="min-w-0">
              <dt className="flex items-center gap-2 text-xs font-medium text-muted">
                <span aria-hidden="true" className={cn("h-3 w-1.5 rounded-full", figure.swatch)} />
                {figure.label}
              </dt>
              <dd
                className={cn(
                  "mt-1 text-2xl font-semibold leading-tight tracking-tight tabular-nums",
                  figure.label === "Actual" && overrun ? "text-danger-text" : "text-text",
                )}
              >
                <CurrencyText value={figure.value} compact />
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-1.5">
          <div
            role="img"
            aria-label={
              estimated > 0
                ? `Actual spend is ${formatPercent((actual / estimated) * 100, 0)} of the estimate; approved is ${formatPercent((approved / estimated) * 100, 0)}.`
                : "No estimated costs recorded yet."
            }
            className="relative h-3 w-full overflow-hidden rounded-full bg-soft"
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-soft-strong" style={{ width: `${approvedPct}%` }} />
            <div
              className={cn("absolute inset-y-0 left-0 rounded-full", overrun ? "bg-danger" : "bg-deep")}
              style={{ width: `${spentPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted">
            <span>₹0</span>
            <span className="tabular-nums">Estimate {formatINR(estimated, { compact: true })}</span>
          </div>
        </div>
      </div>
      <div
        className={cn(
          "px-5 py-3 text-xs leading-relaxed [&_strong]:font-semibold",
          overrun ? "bg-danger-bg text-danger-text" : "bg-soft text-deep/80",
        )}
      >
        {!hasCosts ? (
          <>No material costs have been recorded yet.</>
        ) : overrun ? (
          <>
            <strong>Cost overrun:</strong> billed items cost {formatINR(variance)} more than their estimate.
          </>
        ) : (
          <>
            Variance on billed items (actual − estimated): <strong>{formatINR(variance)}</strong> — items
            without an actual cost yet are left out until they are billed.
          </>
        )}
      </div>
    </section>
  );
}
