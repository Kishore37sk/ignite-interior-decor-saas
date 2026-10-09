/**
 * URL search-param parsing/building for server-rendered lists (ARCHITECTURE §8).
 * Every parser is defensive: unknown or malformed values fall back to defaults so
 * hand-edited URLs can never break a page or reach the database unvalidated.
 */
import {
  DATE_RANGE_PRESETS,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SEARCH_MAX_LENGTH,
  type DateRangePreset,
} from "@/lib/constants";
import { isDateOnly, resolveDateRange, type DateRange } from "@/lib/dates";

/** Shape of Next.js `searchParams` (after awaiting the page prop). */
export type SearchParamsRecord = Record<string, string | string[] | undefined>;
export type SearchParamsInput = SearchParamsRecord | URLSearchParams;

export type SortDirection = "asc" | "desc";

/** First non-empty, trimmed value of a param. */
export function getParam(params: SearchParamsInput, key: string): string | undefined {
  const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Free-text search: trimmed, whitespace-collapsed, length-limited. */
export function parseSearchQuery(params: SearchParamsInput, key = "q"): string {
  const value = getParam(params, key);
  if (!value) return "";
  return value.replace(/\s+/g, " ").slice(0, SEARCH_MAX_LENGTH);
}

/** Single enum value from an allow-list; otherwise `undefined`. */
export function parseEnumParam<const T extends string>(
  params: SearchParamsInput,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = getParam(params, key);
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** Comma-separated multi-value enum (`status=planning,design`), de-duplicated. */
export function parseEnumListParam<const T extends string>(
  params: SearchParamsInput,
  key: string,
  allowed: readonly T[],
): T[] {
  const value = getParam(params, key);
  if (!value) return [];
  const out: T[] = [];
  for (const part of value.split(",")) {
    const v = part.trim();
    if ((allowed as readonly string[]).includes(v) && !out.includes(v as T)) out.push(v as T);
  }
  return out;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID param (e.g. `sm`, `admin`, `project`), lower-cased; otherwise `undefined`. */
export function parseUuidParam(params: SearchParamsInput, key: string): string | undefined {
  const value = getParam(params, key);
  return value && UUID_RE.test(value) ? value.toLowerCase() : undefined;
}

/** `YYYY-MM-DD` param; otherwise `undefined`. */
export function parseDateParam(params: SearchParamsInput, key: string): string | undefined {
  const value = getParam(params, key);
  return isDateOnly(value) ? value : undefined;
}

export function parseBooleanParam(params: SearchParamsInput, key: string): boolean {
  const value = getParam(params, key)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function parseIntStrict(value: string | undefined): number | null {
  if (!value || !/^\d{1,9}$/.test(value)) return null;
  return Number(value);
}

/** 1-based page number; invalid or < 1 → 1. */
export function parsePage(params: SearchParamsInput, key = "page"): number {
  const n = parseIntStrict(getParam(params, key));
  return n !== null && n >= 1 ? n : 1;
}

export function clampPageSize(size: number, max = MAX_PAGE_SIZE): number {
  if (!Number.isFinite(size) || size < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(size), max);
}

/** Page size clamped to 1..MAX_PAGE_SIZE; missing/invalid → DEFAULT_PAGE_SIZE. */
export function parsePageSize(
  params: SearchParamsInput,
  defaultSize = DEFAULT_PAGE_SIZE,
  key = "pageSize",
): number {
  const n = parseIntStrict(getParam(params, key));
  if (n === null || n < 1) return defaultSize;
  return clampPageSize(n);
}

/** Inclusive `{ from, to }` row indexes for PostgREST `.range()`. */
export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Math.max(1, Math.floor(page));
  const from = (safePage - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function totalPages(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

export type SortState<K extends string> = {
  sort: K;
  dir: SortDirection;
  ascending: boolean;
};

/**
 * Sort column restricted to a whitelist of UI keys. Returns the default when the
 * key is unknown, so arbitrary column names never reach `.order()`.
 */
export function parseSort<const K extends string>(
  params: SearchParamsInput,
  allowed: readonly K[],
  defaults: { sort: K; dir?: SortDirection },
): SortState<K> {
  const sortValue = getParam(params, "sort");
  const sort =
    sortValue !== undefined && (allowed as readonly string[]).includes(sortValue)
      ? (sortValue as K)
      : defaults.sort;
  const dirValue = getParam(params, "dir");
  const dir: SortDirection =
    dirValue === "asc" || dirValue === "desc" ? dirValue : (defaults.dir ?? "asc");
  return { sort, dir, ascending: dir === "asc" };
}

/**
 * Map a whitelisted sort key to the real column (when UI keys differ from columns).
 * `sortColumn("client", { client: "client_name" })` → `"client_name"`.
 */
export function sortColumn<K extends string>(key: K, columns: Partial<Record<K, string>>): string {
  return columns[key] ?? key;
}

export type DateRangeFilter = DateRange & { preset: DateRangePreset | undefined };

/** `range` preset (+ `from`/`to` for custom) resolved to an IST date-only range. */
export function parseDateRange(params: SearchParamsInput, today?: string): DateRangeFilter {
  const preset = parseEnumParam(params, "range", DATE_RANGE_PRESETS);
  const from = parseDateParam(params, "from");
  const to = parseDateParam(params, "to");
  if (!preset) {
    // Bare from/to without a preset behave like a custom range.
    if (from || to) return { preset: "custom", ...resolveDateRange("custom", from, to, today) };
    return { preset: undefined, from: null, to: null };
  }
  return { preset, ...resolveDateRange(preset, from, to, today) };
}

export type ListParams<K extends string> = {
  q: string;
  page: number;
  pageSize: number;
  sort: K;
  dir: SortDirection;
  ascending: boolean;
  range: { from: number; to: number };
};

/** Common list params in one call: search, pagination and whitelisted sort. */
export function parseListParams<const K extends string>(
  params: SearchParamsInput,
  options: { sortable: readonly K[]; defaultSort: K; defaultDir?: SortDirection; defaultPageSize?: number },
): ListParams<K> {
  const page = parsePage(params);
  const pageSize = parsePageSize(params, options.defaultPageSize);
  const sort = parseSort(params, options.sortable, {
    sort: options.defaultSort,
    dir: options.defaultDir,
  });
  return {
    q: parseSearchQuery(params),
    page,
    pageSize,
    ...sort,
    range: pageRange(page, pageSize),
  };
}

/* -------------------------------------------------------------------------- */
/* Building                                                                   */
/* -------------------------------------------------------------------------- */

export type ParamUpdates = Record<string, string | number | boolean | readonly string[] | null | undefined>;

function toEntries(params: SearchParamsInput): [string, string][] {
  if (params instanceof URLSearchParams) return Array.from(params.entries());
  const out: [string, string][] = [];
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined) continue;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value !== undefined) out.push([key, value]);
  }
  return out;
}

/**
 * Merge updates into existing params. `null`/`undefined`/`""`/`false`/`[]` remove a key.
 * Any change other than `page` itself resets `page` (so filters never land on an empty page).
 */
export function buildSearchParams(current: SearchParamsInput, updates: ParamUpdates): URLSearchParams {
  const next = new URLSearchParams();
  for (const [key, value] of toEntries(current)) {
    if (value !== "") next.set(key, value);
  }
  let resetPage = false;
  for (const [key, value] of Object.entries(updates)) {
    if (key !== "page") resetPage = true;
    if (value === null || value === undefined || value === false || value === "") {
      next.delete(key);
    } else if (Array.isArray(value)) {
      if (value.length === 0) next.delete(key);
      else next.set(key, value.join(","));
    } else {
      next.set(key, value === true ? "1" : String(value));
    }
  }
  if (resetPage && !("page" in updates)) next.delete("page");
  if (next.get("page") === "1") next.delete("page");
  return next;
}

/** `pathname` + merged query string (no trailing `?` when empty). */
export function buildHref(pathname: string, current: SearchParamsInput, updates: ParamUpdates = {}): string {
  const query = buildSearchParams(current, updates).toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Href for a sortable column header: toggles direction when already sorted by `key`. */
export function sortHref<K extends string>(
  pathname: string,
  current: SearchParamsInput,
  key: K,
  state: { sort: K; dir: SortDirection },
): string {
  const dir: SortDirection = state.sort === key && state.dir === "asc" ? "desc" : "asc";
  return buildHref(pathname, current, { sort: key, dir });
}

/* -------------------------------------------------------------------------- */
/* PostgREST filter helpers                                                   */
/* -------------------------------------------------------------------------- */

/** Escape `%`, `_` and `\` so user text is matched literally inside LIKE/ILIKE. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Build a safe `.or()` filter matching `q` (case-insensitive contains) on any column:
 * `ilikeAnyFilter(["name", "client_code"], "kumar")` →
 * `name.ilike."%kumar%",client_code.ilike."%kumar%"`.
 * Values are double-quoted so commas/parentheses in user input can't alter the filter.
 */
export function ilikeAnyFilter(columns: readonly string[], q: string): string {
  const pattern = `%${escapeLikePattern(q)}%`.replace(/["\\]/g, (c) => `\\${c}`);
  return columns.map((column) => `${column}.ilike."${pattern}"`).join(",");
}
