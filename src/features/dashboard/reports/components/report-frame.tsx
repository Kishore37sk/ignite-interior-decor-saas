import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { REPORT_EXPORT_LIMIT } from "../config";

/** Card wrapper for one report: heading, filters, totals and the table. */
export function ReportFrame({
  id,
  title,
  description,
  filters,
  children,
}: {
  id: string;
  title: string;
  description: string;
  filters: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="card-surface flex min-w-0 flex-col gap-4 p-4 sm:p-5">
      <div className="min-w-0">
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight text-text">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
      {filters}
      {children}
    </section>
  );
}

export type ReportTotalItem = {
  label: string;
  value: ReactNode;
  tone?: "default" | "danger" | "success";
};

/**
 * Totals across every row matching the filters (not just the visible page), shown
 * as a highlighted summary row above the table.
 */
export function ReportTotals({
  items,
  matching,
  truncated,
}: {
  items: readonly ReportTotalItem[];
  matching: number;
  truncated: boolean;
}) {
  return (
    <section aria-label="Totals" className="rounded-xl border border-soft-strong/70 bg-soft/60 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-deep/80">
        Totals · {formatNumber(matching, 0)} matching {matching === 1 ? "row" : "rows"}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-8">
        {items.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-xs text-muted">{item.label}</dt>
            <dd
              className={cn(
                "mt-0.5 text-base font-semibold tabular-nums",
                item.tone === "danger" ? "text-danger-text" : item.tone === "success" ? "text-success-text" : "text-text",
              )}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {truncated ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
          <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          Totals and exports cover the first {formatNumber(REPORT_EXPORT_LIMIT, 0)} matching rows. Narrow the filters
          to include the rest.
        </p>
      ) : null}
    </section>
  );
}
