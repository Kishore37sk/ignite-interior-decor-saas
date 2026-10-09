import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ChartCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Headline figure above the chart (e.g. "89.52%" with a trend chip). */
  headline?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Minimum chart area height in px (keeps layouts stable while data loads). */
  minHeight?: number;
  className?: string;
};

/** Card frame for charts: title/subtitle + actions header, fixed-min-height body. */
export function ChartCard({
  title,
  subtitle,
  headline,
  actions,
  children,
  footer,
  minHeight = 260,
  className,
}: ChartCardProps) {
  return (
    <section className={cn("card-surface flex min-w-0 flex-col p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight tracking-tight text-text">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {headline ? <div className="mt-4">{headline}</div> : null}
      <div className="mt-4 min-w-0 flex-1" style={{ minHeight }}>
        {children}
      </div>
      {footer ? <div className="mt-4 border-t border-border-soft pt-4">{footer}</div> : null}
    </section>
  );
}
