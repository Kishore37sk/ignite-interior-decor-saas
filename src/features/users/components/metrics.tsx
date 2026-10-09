import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A metric value, or a muted "—" plus a short reason when there isn't enough data (app.md §35). */
export function MetricValue({
  value,
  missingHint,
  className,
}: {
  value: ReactNode | null | undefined;
  missingHint: string;
  className?: string;
}) {
  if (value === null || value === undefined || value === "") {
    return (
      <span className={cn("flex flex-col", className)}>
        <span className="text-subtle" aria-hidden="true">
          —
        </span>
        <span className="text-[11px] leading-tight text-muted">{missingHint}</span>
      </span>
    );
  }
  return <span className={cn("tabular-nums", className)}>{value}</span>;
}

export type MetricRingProps = {
  label: string;
  /** 0–100, or null when there is not enough data. */
  percent: number | null;
  /** Big centre text (defaults to `percent%`). */
  value?: string;
  /** Small text under the value (e.g. "/12 projects"). */
  caption?: string;
  /** Shown instead of the ring value when `percent` is null. */
  missingHint?: string;
  tone?: "primary" | "deep" | "warning" | "danger";
  highlight?: boolean;
};

const STROKE: Record<NonNullable<MetricRingProps["tone"]>, string> = {
  primary: "stroke-primary",
  deep: "stroke-deep",
  warning: "stroke-warning",
  danger: "stroke-danger",
};

/** TeamHub-style KPI ring card ("14/20 Days"). Pure SVG, server-rendered. */
export function MetricRing({
  label,
  percent,
  value,
  caption,
  missingHint = "Not enough data yet",
  tone = "primary",
  highlight = false,
}: MetricRingProps) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const pct = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  const display = percent === null ? "—" : (value ?? `${Math.round(pct)}%`);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-3 rounded-2xl border border-border-soft p-4 text-center shadow-card",
        highlight ? "bg-soft border-soft-strong" : "bg-surface",
      )}
    >
      <p className="text-sm font-medium text-text">{label}</p>
      <div
        className="relative size-28"
        role="img"
        aria-label={percent === null ? `${label}: ${missingHint}` : `${label}: ${display}${caption ? ` ${caption}` : ""}`}
      >
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r={radius} fill="none" strokeWidth="9" className="stroke-soft-strong/60" />
          {percent !== null ? (
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct / 100)}
              className={STROKE[tone]}
            />
          ) : null}
        </svg>
        <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center px-3">
          <span className="text-2xl font-semibold leading-none tracking-tight text-text tabular-nums">{display}</span>
          {percent === null ? (
            <span className="mt-1 text-[10px] leading-tight text-muted">{missingHint}</span>
          ) : caption ? (
            <span className="mt-1 text-[11px] text-muted">{caption}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
