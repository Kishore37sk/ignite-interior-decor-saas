/**
 * Timezone-safe date helpers.
 *
 * Business dates (deadlines, required dates, handovers) are date-only `YYYY-MM-DD`
 * strings and are never passed through `new Date(str)` in local time. "Today" is
 * always computed in the business timezone (Asia/Kolkata) using Intl, regardless
 * of the server's or browser's own timezone. Date-only arithmetic is done on UTC
 * day numbers so DST and offsets can never shift a day.
 */
import { APP_TIMEZONE, type DateRangePreset, type Tone } from "@/lib/constants";
import type {
  DeadlineState,
  MaterialRequestStatus,
  ProjectStatus,
  RequiredState,
} from "@/types/database";

const MS_PER_DAY = 86_400_000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type DateInput = string | Date | null | undefined;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
};

const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Wall-clock parts of an instant in the business timezone. */
export function zonedParts(instant: Date): ZonedParts {
  const parts: Record<string, string> = {};
  for (const part of zonedFormatter.formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday ?? "Sun"] ?? 0,
  };
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function toDateOnlyString(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** True for a syntactically and calendrically valid `YYYY-MM-DD` string. */
export function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

/** Today's date in Asia/Kolkata as `YYYY-MM-DD`. */
export function todayIST(now: Date = new Date()): string {
  const p = zonedParts(now);
  return toDateOnlyString(p.year, p.month, p.day);
}

/**
 * Parse a `YYYY-MM-DD` string into a Date at local midnight (safe for date-fns
 * formatting). Returns null for invalid input. Never shifts the calendar day.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value || !isDateOnly(value)) return null;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** Convert any supported input to a business-calendar `YYYY-MM-DD` string. */
export function toDateOnly(value: DateInput): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    if (isDateOnly(value)) return value;
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? null : todayIST(instant);
  }
  return Number.isNaN(value.getTime()) ? null : todayIST(value);
}

/** UTC day number for a date-only string (days since epoch). */
function dayNumber(dateOnly: string): number {
  const [y, m, d] = dateOnly.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Add (or subtract) whole days to a date-only string. */
export function addDays(dateOnly: string, days: number): string {
  return fromDayNumber(dayNumber(dateOnly) + days);
}

/**
 * Whole days from `a` to `b` (`b - a`). Accepts date-only strings, ISO timestamps
 * or Dates (timestamps are first converted to their IST calendar date).
 */
export function daysBetween(a: DateInput, b: DateInput): number | null {
  const from = toDateOnly(a);
  const to = toDateOnly(b);
  if (!from || !to) return null;
  return dayNumber(to) - dayNumber(from);
}

/** Days from today (IST) until the deadline; negative when overdue; null when no date. */
export function daysRemaining(deadline: DateInput, today: string = todayIST()): number | null {
  return daysBetween(today, deadline);
}

/** `08 Oct 2026`. Date-only strings are shown as-is; instants are shown in IST. */
export function formatDate(value: DateInput, fallback = "—"): string {
  const dateOnly = toDateOnly(value);
  if (!dateOnly) return fallback;
  const [y, m, d] = dateOnly.split("-").map(Number) as [number, number, number];
  return `${pad(d)} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** `08 Oct` (no year) — handy for compact charts and chips. */
export function formatDayMonth(value: DateInput, fallback = "—"): string {
  const dateOnly = toDateOnly(value);
  if (!dateOnly) return fallback;
  const [, m, d] = dateOnly.split("-").map(Number) as [number, number, number];
  return `${pad(d)} ${MONTHS_SHORT[m - 1]}`;
}

/** `Oct 2026` from `YYYY-MM` or a date. */
export function formatMonth(value: string | Date | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const normalized = typeof value === "string" && /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  const dateOnly = toDateOnly(normalized);
  if (!dateOnly) return fallback;
  const [y, m] = dateOnly.split("-").map(Number) as [number, number];
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** `08 Oct 2026, 10:32 AM` in IST. Date-only input is formatted as a date. */
export function formatDateTime(value: DateInput, fallback = "—"): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string" && isDateOnly(value)) return formatDate(value, fallback);
  const instant = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(instant.getTime())) return fallback;
  return `${formatDate(instant)}, ${formatTime(instant)}`;
}

/** `10:32 AM` in IST. */
export function formatTime(value: Date | string, fallback = "—"): string {
  const instant = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(instant.getTime())) return fallback;
  const p = zonedParts(instant);
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${pad(hour12)}:${pad(p.minute)} ${p.hour < 12 ? "AM" : "PM"}`;
}

/** Current hour (0–23) in IST. */
export function hourIST(now: Date = new Date()): number {
  return zonedParts(now).hour;
}

/** "Good Morning" / "Good Afternoon" / "Good Evening" based on the IST hour. */
export function greetingForTime(now: Date = new Date()): string {
  const hour = hourIST(now);
  if (hour >= 5 && hour < 12) return "Good Morning";
  if (hour >= 12 && hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function pluralDays(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

/* -------------------------------------------------------------------------- */
/* Deadline logic                                                             */
/* -------------------------------------------------------------------------- */

export type DeadlineInfo = {
  state: DeadlineState;
  label: string;
  tone: Tone;
  days: number | null;
};

/**
 * Derived deadline indicator for a project (independent of the manual status).
 * Mirrors `project_directory.deadline_state`.
 */
export function deadlineInfo(
  deadline: string | null | undefined,
  status: ProjectStatus,
  today: string = todayIST(),
): DeadlineInfo {
  if (status === "completed") return { state: "completed", label: "Completed", tone: "success", days: null };
  if (status === "cancelled") return { state: "cancelled", label: "Cancelled", tone: "muted", days: null };
  const days = deadline ? daysRemaining(deadline, today) : null;
  if (days === null) return { state: "no_date", label: "No deadline", tone: "muted", days: null };
  if (days < 0) return { state: "overdue", label: `Overdue by ${pluralDays(-days)}`, tone: "danger", days };
  if (days === 0) return { state: "due_today", label: "Due today", tone: "danger", days };
  if (days === 1) return { state: "due_tomorrow", label: "Due tomorrow", tone: "warning", days };
  const label = `${pluralDays(days)} remaining`;
  if (days <= 7) return { state: "due_7", label, tone: "warning", days };
  if (days <= 14) return { state: "due_14", label, tone: "primary", days };
  if (days <= 30) return { state: "due_30", label, tone: "primary", days };
  return { state: "on_track", label, tone: "success", days };
}

export type RequiredDateInfo = {
  state: RequiredState;
  label: string;
  tone: Tone;
  days: number | null;
};

const CLOSED_REQUEST_LABELS: Partial<Record<MaterialRequestStatus, string>> = {
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/**
 * Required-date indicator for a material request.
 * Mirrors `material_request_directory.required_state`.
 */
export function requiredDateInfo(
  requiredDate: string | null | undefined,
  status: MaterialRequestStatus,
  today: string = todayIST(),
): RequiredDateInfo {
  const closedLabel = CLOSED_REQUEST_LABELS[status];
  if (closedLabel) {
    return {
      state: "closed",
      label: closedLabel,
      tone: status === "delivered" ? "success" : "muted",
      days: null,
    };
  }
  const days = requiredDate ? daysRemaining(requiredDate, today) : null;
  if (days === null) return { state: "upcoming", label: "No required date", tone: "muted", days: null };
  if (days < 0) return { state: "overdue", label: `Overdue by ${pluralDays(-days)}`, tone: "danger", days };
  if (days === 0) return { state: "due_today", label: "Due today", tone: "danger", days };
  if (days === 1) return { state: "due_tomorrow", label: "Due tomorrow", tone: "warning", days };
  const label = `Required in ${pluralDays(days)}`;
  if (days <= 7) return { state: "due_soon", label, tone: "warning", days };
  return { state: "upcoming", label, tone: "primary", days };
}

/* -------------------------------------------------------------------------- */
/* Date ranges                                                                */
/* -------------------------------------------------------------------------- */

export type DateRange = { from: string | null; to: string | null };

/**
 * Resolve a filter preset to an inclusive `{ from, to }` date-only range in IST.
 * Weeks run Monday–Sunday; `next_7` / `next_30` span 7 / 30 calendar days including today.
 * `custom` uses validated `from`/`to` (swapped if reversed).
 */
export function resolveDateRange(
  preset: DateRangePreset | null | undefined,
  from?: string | null,
  to?: string | null,
  today: string = todayIST(),
): DateRange {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "this_week": {
      const [y, m, d] = today.split("-").map(Number) as [number, number, number];
      const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
      const offsetToMonday = (weekday + 6) % 7;
      const monday = addDays(today, -offsetToMonday);
      return { from: monday, to: addDays(monday, 6) };
    }
    case "this_month": {
      const [y, m] = today.split("-").map(Number) as [number, number];
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { from: toDateOnlyString(y, m, 1), to: toDateOnlyString(y, m, lastDay) };
    }
    // "Next N days" = N calendar days including today (today … today + N − 1).
    case "next_7":
      return { from: today, to: addDays(today, 6) };
    case "next_30":
      return { from: today, to: addDays(today, 29) };
    case "custom": {
      const f = isDateOnly(from) ? from : null;
      const t = isDateOnly(to) ? to : null;
      if (f && t && f > t) return { from: t, to: f };
      return { from: f, to: t };
    }
    default:
      return { from: null, to: null };
  }
}

/* -------------------------------------------------------------------------- */
/* Relative time                                                              */
/* -------------------------------------------------------------------------- */

/** "just now", "5 min ago", "3 hours ago", "Yesterday", "4 days ago", else `08 Oct 2026`. */
export function relativeTime(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "—";
  const instant = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(instant.getTime())) return "—";
  const diffMs = now.getTime() - instant.getTime();
  if (diffMs < 0) return formatDateTime(instant);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const calendarDays = daysBetween(instant, now) ?? 0;
  if (calendarDays <= 1) return "Yesterday";
  if (calendarDays < 7) return `${calendarDays} days ago`;
  return formatDate(instant);
}
