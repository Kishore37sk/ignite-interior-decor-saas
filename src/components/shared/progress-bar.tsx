import { useId } from "react";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DeadlineState } from "@/types/database";

export type ProgressTone = "auto" | "primary" | "success" | "warning" | "danger" | "deep";

export type ProgressBarProps = {
  /** 0–100 (clamped). */
  value: number | string | null | undefined;
  /** Accessible name; also shown above the bar when `showLabel`. */
  label?: string;
  showLabel?: boolean;
  /** Show the percentage at the end of the bar. */
  showValue?: boolean;
  tone?: ProgressTone;
  /** Deadline state used by `tone="auto"` (overdue → danger, due soon → warning). */
  state?: DeadlineState | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const FILL: Record<Exclude<ProgressTone, "auto">, string> = {
  primary: "bg-primary",
  success: "bg-primary",
  warning: "bg-warning",
  danger: "bg-danger",
  deep: "bg-deep",
};

const HEIGHT = { sm: "h-1.5", md: "h-2", lg: "h-3" } as const;

function autoTone(value: number, state: DeadlineState | null | undefined): Exclude<ProgressTone, "auto"> {
  if (state === "overdue") return "danger";
  if (value >= 100 || state === "completed") return "deep";
  if (state === "due_today" || state === "due_tomorrow" || state === "due_7") return "warning";
  return "primary";
}

function clamp(value: ProgressBarProps["value"]): number {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Accessible progress bar (`role="progressbar"`) with tone by value/deadline state. */
export function ProgressBar({
  value,
  label = "Progress",
  showLabel = false,
  showValue = true,
  tone = "auto",
  state,
  size = "md",
  className,
}: ProgressBarProps) {
  const labelId = useId();
  const pct = clamp(value);
  const resolved = tone === "auto" ? autoTone(pct, state) : tone;
  const text = formatPercent(pct, pct % 1 === 0 ? 0 : 1);

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {showLabel ? (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span id={labelId} className="font-medium text-muted">
            {label}
          </span>
        </div>
      ) : null}
      <div className="flex items-center gap-2.5">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={text}
          {...(showLabel ? { "aria-labelledby": labelId } : { "aria-label": label })}
          className={cn("relative w-full min-w-12 overflow-hidden rounded-full bg-surface-sunken", HEIGHT[size])}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-500 ease-out", FILL[resolved])}
            style={{ width: `${pct}%` }}
          />
        </div>
        {showValue ? (
          <span aria-hidden="true" className="w-11 shrink-0 text-right text-xs font-semibold tabular-nums text-text">
            {text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
