/**
 * Number, currency and text formatting with Indian conventions
 * (lakh/crore digit grouping: ₹4,20,000 · ₹4.2L · ₹1.25Cr).
 */
import { APP_LOCALE } from "@/lib/constants";

type Numeric = number | string | null | undefined;

const LAKH = 100_000;
const CRORE = 10_000_000;

function toNumber(value: Numeric): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const integerFormatter = new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 0 });
const decimalFormatters = new Map<number, Intl.NumberFormat>();

function decimalFormatter(maxDecimals: number): Intl.NumberFormat {
  let formatter = decimalFormatters.get(maxDecimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat(APP_LOCALE, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    });
    decimalFormatters.set(maxDecimals, formatter);
  }
  return formatter;
}

/** Trim to at most `decimals` places and drop trailing zeros: 4.20 → "4.2", 4.00 → "4". */
function trimDecimals(n: number, decimals: number): string {
  const factor = 10 ** decimals;
  const rounded = Math.round(n * factor) / factor;
  return String(rounded);
}

type CompactUnit = readonly [size: number, suffix: string];

/**
 * Abbreviate with the largest unit the value reaches, rounding first: if rounding would
 * show a full next unit (99.999 L → "100L"), the next unit is used instead ("1Cr").
 * `units` must be ascending by size. Returns null below the smallest unit.
 */
function compactWithUnits(abs: number, decimals: number, units: readonly CompactUnit[]): string | null {
  let index = -1;
  for (let i = 0; i < units.length; i += 1) {
    if (abs >= (units[i]?.[0] ?? Infinity)) index = i;
  }
  if (index < 0) {
    const first = units[0];
    // Just below the smallest unit but rounding up to it (e.g. 999.96 → "1K").
    if (first && Number(trimDecimals(abs, decimals)) >= first[0]) index = 0;
    else return null;
  }
  const current = units[index];
  if (!current) return null;
  const next = units[index + 1];
  if (next && Number(trimDecimals(abs / current[0], decimals)) * current[0] >= next[0]) {
    return `${trimDecimals(abs / next[0], decimals)}${next[1]}`;
  }
  return `${trimDecimals(abs / current[0], decimals)}${current[1]}`;
}

const INR_UNITS: readonly CompactUnit[] = [
  [LAKH, "L"],
  [CRORE, "Cr"],
];
const COUNT_UNITS: readonly CompactUnit[] = [
  [1_000, "K"],
  [LAKH, "L"],
  [CRORE, "Cr"],
];

export type FormatINROptions = {
  /** Use lakh/crore abbreviations for large values (₹4.2L, ₹1.25Cr). */
  compact?: boolean;
  /** Text returned for null/invalid values. */
  fallback?: string;
};

/**
 * Format rupees with Indian grouping.
 * `formatINR(420000)` → `₹4,20,000`; `formatINR(420000, { compact: true })` → `₹4.2L`.
 * Paise are shown (2 decimals) only when the amount is not a whole number.
 */
export function formatINR(value: Numeric, options: FormatINROptions = {}): string {
  const { compact = false, fallback = "—" } = options;
  const n = toNumber(value);
  if (n === null) return fallback;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);

  if (compact && abs >= LAKH) {
    const short = compactWithUnits(abs, 2, INR_UNITS);
    if (short) return `${sign}₹${short}`;
  }

  const roundedPaise = Math.round(abs * 100) / 100;
  const body = Number.isInteger(roundedPaise)
    ? integerFormatter.format(roundedPaise)
    : new Intl.NumberFormat(APP_LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(roundedPaise);
  return `${sign}₹${body}`;
}

/** Indian-grouped number: 1234567 → "12,34,567". */
export function formatNumber(value: Numeric, maxDecimals = 2, fallback = "—"): string {
  const n = toNumber(value);
  if (n === null) return fallback;
  return maxDecimals === 0 ? integerFormatter.format(n) : decimalFormatter(maxDecimals).format(n);
}

/** Compact count: 1500 → "1.5K", 250000 → "2.5L", 12000000 → "1.2Cr". */
export function formatCompactNumber(value: Numeric, fallback = "—"): string {
  const n = toNumber(value);
  if (n === null) return fallback;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const short = compactWithUnits(abs, 1, COUNT_UNITS);
  return `${sign}${short ?? trimDecimals(abs, 1)}`;
}

/** Percent from a 0–100 value: 45 → "45%", 12.345 (1 dp) → "12.3%". */
export function formatPercent(value: Numeric, decimals = 0, fallback = "—"): string {
  const n = toNumber(value);
  if (n === null) return fallback;
  return `${trimDecimals(n, decimals)}%`;
}

/** Quantity with unit: (100, "Bags") → "100 Bags"; (12.5, "Sq Ft") → "12.5 Sq Ft". */
export function formatQuantity(value: Numeric, unit?: string | null, fallback = "—"): string {
  const n = toNumber(value);
  if (n === null) return fallback;
  const qty = formatNumber(n, 2);
  return unit ? `${qty} ${unit}` : qty;
}

/** Human file size: 2048 → "2 KB". */
export function formatFileSize(bytes: Numeric, fallback = "—"): string {
  const n = toNumber(bytes);
  if (n === null || n < 0) return fallback;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let size = n / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${trimDecimals(size, 1)} ${units[unitIndex]}`;
}

/** Up to two initials: "Kishore Kumar M" → "KM", "admin@x.com" → "A". */
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const cleaned = name.split("@")[0]?.replace(/[^\p{L}\p{N}\s.'-]/gu, " ").trim() ?? "";
  const words = cleaned.split(/[\s.]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** First name for greetings: "Kishore Kumar" → "Kishore". */
export function firstName(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().split(/\s+/)[0] ?? "";
}

/** "1 project" / "3 projects". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count, 0)} ${count === 1 ? singular : plural}`;
}

/** Collapse whitespace and cut to `max` chars with an ellipsis. */
export function truncate(text: string | null | undefined, max: number): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** "handover_pending" → "Handover Pending" (fallback when no label map exists). */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
