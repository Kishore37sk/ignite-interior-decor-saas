import { describe, expect, it } from "vitest";
import { chunk, fetchAllByIds, fetchAllRows, fetchPage, lastPageFor, MAX_ROWS_PER_REQUEST, rangeOf } from "./pagination";

const OUT_OF_RANGE = { code: "PGRST103", message: "Requested range not satisfiable" };

describe("page maths", () => {
  it("computes ranges and the last page", () => {
    expect(rangeOf(1, 25)).toEqual({ from: 0, to: 24 });
    expect(rangeOf(3, 10)).toEqual({ from: 20, to: 29 });
    expect(lastPageFor(0, 25)).toBe(1);
    expect(lastPageFor(51, 25)).toBe(3);
    expect(lastPageFor(50, 25)).toBe(2);
  });
});

describe("fetchPage", () => {
  const rows = Array.from({ length: 23 }, (_, i) => i);
  const run = async (from: number, to: number) =>
    from >= rows.length
      ? { data: null, error: OUT_OF_RANGE, count: null }
      : { data: rows.slice(from, to + 1), error: null, count: rows.length };
  const count = async () => ({ error: null, count: rows.length });

  it("returns the requested page when it exists", async () => {
    await expect(fetchPage(2, 10, run, count)).resolves.toEqual({ rows: rows.slice(10, 20), total: 23, page: 2, error: null });
  });

  it("falls back to the last page for a stale page number", async () => {
    await expect(fetchPage(7, 10, run, count)).resolves.toEqual({ rows: [20, 21, 22], total: 23, page: 3, error: null });
  });

  it("passes other errors through", async () => {
    const boom = { code: "42501", message: "denied" };
    const result = await fetchPage(1, 10, async () => ({ data: null, error: boom, count: null }), count);
    expect(result.error).toBe(boom);
  });
});

describe("large reads", () => {
  it("reads past the 1000-row response cap", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i);
    const result = await fetchAllRows(async (from, to) => ({ data: all.slice(from, Math.min(to + 1, from + MAX_ROWS_PER_REQUEST)), error: null }));
    expect(result.rows).toHaveLength(2500);
  });

  it("splits long id lists into chunks", async () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const sizes: number[] = [];
    const result = await fetchAllByIds(ids, async (part) => {
      sizes.push(part.length);
      return { data: part, error: null };
    });
    expect(sizes).toEqual([100, 100, 50]);
    expect(result.rows).toHaveLength(250);
  });
});
