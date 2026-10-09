import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTrend = {
  /** Display text, e.g. "+12%" or "3". */
  value: string;
  direction: "up" | "down" | "flat";
  /** Whether this direction is good news (controls colour). Defaults: up = good. */
  positive?: boolean;
  /** Trailing context, e.g. "from last month". */
  label?: string;
};

export type StatCardVariant = "default" | "highlight" | "danger";

export type StatCardProps = {
  label: string;
  value: ReactNode;
  /** Small trailing text after the numeral (e.g. "Projects", "Pending Review"). */
  unit?: ReactNode;
  /** Secondary line under the value. */
  sub?: ReactNode;
  icon?: LucideIcon;
  trend?: StatTrend;
  /** Soft-tinted footer strip message (TeamHub). */
  footer?: ReactNode;
  /** Makes the whole card a drill-down link. */
  href?: string;
  variant?: StatCardVariant;
  className?: string;
};

const VARIANTS: Record<StatCardVariant, { card: string; footer: string; icon: string; value: string }> = {
  default: {
    card: "bg-surface",
    footer: "bg-soft text-deep/80",
    icon: "bg-surface-muted text-primary-strong",
    value: "text-text",
  },
  highlight: {
    card: "bg-soft border-soft-strong",
    footer: "bg-soft-strong/70 text-deep",
    icon: "bg-primary text-white",
    value: "text-deep",
  },
  danger: {
    card: "bg-surface",
    footer: "bg-danger-bg text-danger-text",
    icon: "bg-danger-bg text-danger",
    value: "text-danger-text",
  },
};

function TrendChip({ trend }: { trend: StatTrend }) {
  const good = trend.positive ?? trend.direction !== "down";
  const Icon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <span
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-full px-2 font-semibold tabular-nums",
          trend.direction === "flat"
            ? "bg-surface-sunken text-muted"
            : good
              ? "bg-soft text-deep"
              : "bg-danger-bg text-danger-text",
        )}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {trend.value}
      </span>
      {trend.label ? <span>{trend.label}</span> : null}
    </span>
  );
}

/**
 * TeamHub KPI card: label + icon tile, big numeral with small unit text, optional
 * trend chip, and a soft-green footer strip. With `href`, the entire card is a link.
 */
export function StatCard({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  trend,
  footer,
  href,
  variant = "default",
  className,
}: StatCardProps) {
  const styles = VARIANTS[variant];

  const body = (
    <>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted">{label}</p>
          {Icon ? (
            <span
              aria-hidden="true"
              className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", styles.icon)}
            >
              <Icon className="size-5" />
            </span>
          ) : href ? (
            <span
              aria-hidden="true"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted transition-colors group-hover:bg-primary group-hover:text-white"
            >
              <ArrowRight className="size-4" />
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
          <span
            className={cn(
              "text-[28px] font-semibold leading-none tracking-tight tabular-nums sm:text-[32px]",
              styles.value,
            )}
          >
            {value}
          </span>
          {unit ? <span className="text-xs font-medium text-muted">{unit}</span> : null}
        </div>
        {trend || sub ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {trend ? <TrendChip trend={trend} /> : null}
            {sub ? <span>{sub}</span> : null}
          </div>
        ) : null}
      </div>
      {footer ? (
        <div className={cn("px-5 py-3 text-xs leading-relaxed [&_strong]:font-semibold", styles.footer)}>{footer}</div>
      ) : null}
    </>
  );

  const classes = cn(
    "group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border-soft shadow-card",
    styles.card,
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          classes,
          "transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-pop",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={classes}>{body}</div>;
}
