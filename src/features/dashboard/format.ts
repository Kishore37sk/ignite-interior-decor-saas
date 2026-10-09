import { formatNumber } from "@/lib/format";

/** "3.5 days" / "1 day" / "—". */
export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${formatNumber(value, 1)} ${value === 1 ? "day" : "days"}`;
}

/** Response time: under two days in hours ("5.5 h"), otherwise days ("3.2 days"). */
export function formatResponseTime(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return "—";
  if (hours < 48) return `${formatNumber(hours, 1)} h`;
  return formatDays(Math.round((hours / 24) * 10) / 10);
}

/** Integer count with Indian grouping. */
export function formatCount(value: number | null | undefined): string {
  return formatNumber(value ?? 0, 0);
}
