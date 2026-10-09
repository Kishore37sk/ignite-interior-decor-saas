/**
 * Out-of-range page handling for PostgREST lists.
 *
 * With `count: 'exact'`, PostgREST answers 416 / `PGRST103` when the requested offset is
 * past the last row (e.g. a stale `?page=3` link after rows were completed or archived).
 * Instead of an error boundary or an empty page without pagination, lists re-run the
 * query on the last page that exists and report that page back.
 */

export const RANGE_NOT_SATISFIABLE = "PGRST103";

type ErrorLike = { code?: string } | null | undefined;

export function isOutOfRange(error: ErrorLike): boolean {
  return Boolean(error && error.code === RANGE_NOT_SATISFIABLE);
}

/** Last page number for `total` rows (always ≥ 1). */
export function lastPageFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

/** Inclusive `.range(from, to)` bounds of a 1-based page. */
export function rangeOf(page: number, pageSize: number): { from: number; to: number } {
  const from = (Math.max(1, page) - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

type PageResponse<R> = { data: R[] | null; error: unknown; count?: number | null };
type CountResponse = { error: unknown; count?: number | null };

export type FetchedPage<R> = { rows: R[]; total: number; page: number; error: unknown };

/**
 * Run a paginated query (`run(from, to)` must request `count: 'exact'`). When the page is
 * out of range, `count()` (a head-only count with the same filters) finds the last page,
 * which is fetched instead. `page` in the result is the page actually returned.
 */
export async function fetchPage<R>(
  page: number,
  pageSize: number,
  run: (from: number, to: number) => PromiseLike<PageResponse<R>>,
  count: () => PromiseLike<CountResponse>,
): Promise<FetchedPage<R>> {
  const first = rangeOf(page, pageSize);
  const result = await run(first.from, first.to);
  if (!isOutOfRange(result.error as ErrorLike)) {
    return { rows: result.data ?? [], total: result.count ?? 0, page, error: result.error ?? null };
  }

  const head = await count();
  if (head.error) return { rows: [], total: 0, page, error: head.error };
  const total = head.count ?? 0;
  const last = lastPageFor(total, pageSize);
  if (last >= page) return { rows: [], total, page, error: null };
  const retry = rangeOf(last, pageSize);
  const again = await run(retry.from, retry.to);
  return { rows: again.data ?? [], total: again.count ?? total, page: last, error: again.error ?? null };
}

/* -------------------------------------------------------------------------- */
/* Large reads                                                                */
/* -------------------------------------------------------------------------- */

/** Supabase caps every PostgREST response at db-max-rows (default 1000), whatever `.limit()` says. */
export const MAX_ROWS_PER_REQUEST = 1000;

/** Ids per `.in()` filter: ~40 bytes per uuid keeps request URLs far below gateway limits. */
export const IN_FILTER_CHUNK = 100;

type RowsResponse<R> = { data: R[] | null; error: unknown };

/**
 * Read every row of a query in MAX_ROWS_PER_REQUEST-sized `.range()` pages (the query must
 * have a deterministic order). Stops at `max` rows as a safety net.
 */
export async function fetchAllRows<R>(
  run: (from: number, to: number) => PromiseLike<RowsResponse<R>>,
  max = 50_000,
): Promise<{ rows: R[]; error: unknown }> {
  const rows: R[] = [];
  for (let from = 0; from < max; from += MAX_ROWS_PER_REQUEST) {
    const to = Math.min(from + MAX_ROWS_PER_REQUEST, max) - 1;
    const { data, error } = await run(from, to);
    if (error) return { rows, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }
  return { rows, error: null };
}

export function chunk<T>(items: readonly T[], size = IN_FILTER_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Read every row matching `.in(column, ids)` for an arbitrarily long id list: ids are split
 * into IN_FILTER_CHUNK-sized groups and each group is read with fetchAllRows. Rows come back
 * grouped by chunk, so callers that need a global order must sort.
 */
export async function fetchAllByIds<R>(
  ids: readonly string[],
  run: (ids: string[], from: number, to: number) => PromiseLike<RowsResponse<R>>,
): Promise<{ rows: R[]; error: unknown }> {
  const unique = Array.from(new Set(ids));
  const results = await Promise.all(chunk(unique).map((part) => fetchAllRows<R>((from, to) => run(part, from, to))));
  const failed = results.find((r) => r.error);
  if (failed) return { rows: [], error: failed.error };
  return { rows: results.flatMap((r) => r.rows), error: null };
}
