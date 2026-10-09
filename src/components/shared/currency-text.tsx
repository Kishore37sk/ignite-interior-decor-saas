import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CurrencyTextProps = {
  value: number | string | null | undefined;
  /** Lakh/crore abbreviations (₹4.2L); the exact amount is kept in `title` and for screen readers. */
  compact?: boolean;
  fallback?: string;
  /** Colour negatives red / positives green and prefix positives with "+" (for variances). */
  signed?: boolean;
  /**
   * With `signed`: positives are bad (red) and negatives good (green) — e.g. cost variance
   * (actual − estimated), where a positive figure is an overrun.
   */
  invert?: boolean;
  className?: string;
};

/** INR amount with Indian grouping and tabular figures. */
export function CurrencyText({
  value,
  compact = false,
  fallback = "—",
  signed = false,
  invert = false,
  className,
}: CurrencyTextProps) {
  const n = value === null || value === undefined || value === "" ? null : Number(value);
  const valid = n !== null && Number.isFinite(n);
  const display = formatINR(value, { compact, fallback });
  const full = formatINR(value, { fallback });

  return (
    <span
      title={compact && valid ? full : undefined}
      className={cn(
        "whitespace-nowrap tabular-nums",
        signed && valid && n < 0 && (invert ? "text-success-text" : "text-danger-text"),
        signed && valid && n > 0 && (invert ? "text-danger-text" : "text-success-text"),
        !valid && "text-muted",
        className,
      )}
    >
      {signed && valid && n > 0 ? "+" : null}
      {compact && valid && display !== full ? (
        <>
          <span aria-hidden="true">{display}</span>
          <span className="sr-only">{full}</span>
        </>
      ) : (
        display
      )}
    </span>
  );
}
