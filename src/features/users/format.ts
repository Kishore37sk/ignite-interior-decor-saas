import { formatNumber } from "@/lib/format";

/** "3.5 h" below two days, otherwise "2.1 days"; null when there is no data. */
export function formatHours(hours: number | null | undefined): string | null {
  if (hours === null || hours === undefined) return null;
  if (hours < 48) return `${formatNumber(hours, 1)} h`;
  return `${formatNumber(hours / 24, 1)} days`;
}
