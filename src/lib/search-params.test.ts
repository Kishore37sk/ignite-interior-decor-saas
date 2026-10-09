import { describe, expect, it } from "vitest";
import { MAX_PAGE_SIZE } from "./constants";
import {
  buildHref,
  buildSearchParams,
  escapeLikePattern,
  getParam,
  ilikeAnyFilter,
  pageRange,
  parseDateRange,
  parseEnumListParam,
  parseEnumParam,
  parseListParams,
  parsePage,
  parsePageSize,
  parseSearchQuery,
  parseSort,
  parseUuidParam,
  sortHref,
  totalPages,
} from "./search-params";

const STATUSES = ["planning", "design", "execution"] as const;

describe("getParam / parseSearchQuery", () => {
  it("takes the first trimmed value", () => {
    expect(getParam({ q: ["  kumar ", "x"] }, "q")).toBe("kumar");
    expect(getParam({ q: "   " }, "q")).toBeUndefined();
    expect(getParam(new URLSearchParams("q=cement"), "q")).toBe("cement");
  });

  it("collapses whitespace and limits length", () => {
    expect(parseSearchQuery({ q: "  living   room " })).toBe("living room");
    expect(parseSearchQuery({ q: "a".repeat(500) })).toHaveLength(100);
    expect(parseSearchQuery({})).toBe("");
  });
});

describe("enum and id params", () => {
  it("accepts only whitelisted values", () => {
    expect(parseEnumParam({ status: "design" }, "status", STATUSES)).toBe("design");
    expect(parseEnumParam({ status: "drop table" }, "status", STATUSES)).toBeUndefined();
  });

  it("parses comma-separated lists without duplicates", () => {
    expect(parseEnumListParam({ status: "design,bogus,planning,design" }, "status", STATUSES)).toEqual([
      "design",
      "planning",
    ]);
  });

  it("validates uuids", () => {
    expect(parseUuidParam({ sm: "0E1F7C2A-1B2C-4D5E-8F90-123456789ABC" }, "sm")).toBe(
      "0e1f7c2a-1b2c-4d5e-8f90-123456789abc",
    );
    expect(parseUuidParam({ sm: "1 or 1=1" }, "sm")).toBeUndefined();
  });
});

describe("pagination", () => {
  it("clamps page and page size", () => {
    expect(parsePage({ page: "3" })).toBe(3);
    expect(parsePage({ page: "0" })).toBe(1);
    expect(parsePage({ page: "-2" })).toBe(1);
    expect(parsePage({ page: "abc" })).toBe(1);
    expect(parsePageSize({ pageSize: "50" })).toBe(50);
    expect(parsePageSize({ pageSize: "100000" })).toBe(MAX_PAGE_SIZE);
    expect(parsePageSize({ pageSize: "0" })).toBe(20);
    expect(parsePageSize({}, 10)).toBe(10);
  });

  it("computes ranges and page counts", () => {
    expect(pageRange(1, 20)).toEqual({ from: 0, to: 19 });
    expect(pageRange(3, 10)).toEqual({ from: 20, to: 29 });
    expect(totalPages(0, 20)).toBe(1);
    expect(totalPages(41, 20)).toBe(3);
  });
});

describe("sorting", () => {
  const sortable = ["name", "deadline", "progress"] as const;

  it("only allows whitelisted sort keys", () => {
    expect(parseSort({ sort: "deadline", dir: "desc" }, sortable, { sort: "name" })).toEqual({
      sort: "deadline",
      dir: "desc",
      ascending: false,
    });
    expect(parseSort({ sort: "password", dir: "sideways" }, sortable, { sort: "name", dir: "desc" })).toEqual({
      sort: "name",
      dir: "desc",
      ascending: false,
    });
  });

  it("builds toggle links for sortable headers", () => {
    const current = { sort: "name", dir: "asc", page: "4" };
    expect(sortHref("/projects", current, "name", { sort: "name", dir: "asc" })).toBe("/projects?sort=name&dir=desc");
    expect(sortHref("/projects", current, "deadline", { sort: "name", dir: "asc" })).toBe(
      "/projects?sort=deadline&dir=asc",
    );
  });

  it("parses common list params together", () => {
    const params = parseListParams(
      { q: "villa", page: "2", pageSize: "10", sort: "progress" },
      { sortable, defaultSort: "name" },
    );
    expect(params).toMatchObject({ q: "villa", page: 2, pageSize: 10, sort: "progress", dir: "asc" });
    expect(params.range).toEqual({ from: 10, to: 19 });
  });
});

describe("date range params", () => {
  it("resolves presets and custom ranges", () => {
    expect(parseDateRange({ range: "next_7" }, "2026-10-08")).toEqual({
      preset: "next_7",
      from: "2026-10-08",
      to: "2026-10-14",
    });
    expect(parseDateRange({ from: "2026-10-01", to: "bad" }, "2026-10-08")).toEqual({
      preset: "custom",
      from: "2026-10-01",
      to: null,
    });
    expect(parseDateRange({ range: "forever" }, "2026-10-08")).toEqual({ preset: undefined, from: null, to: null });
  });
});

describe("building params", () => {
  it("merges updates, removes empties and resets page on filter change", () => {
    const next = buildSearchParams({ q: "villa", page: "3", status: "design" }, { status: "planning", q: "" });
    expect(next.toString()).toBe("status=planning");
  });

  it("keeps other params when only the page changes", () => {
    expect(buildHref("/clients", { q: "kumar" }, { page: 2 })).toBe("/clients?q=kumar&page=2");
    expect(buildHref("/clients", { q: "kumar", page: "2" }, { page: 1 })).toBe("/clients?q=kumar");
    expect(buildHref("/clients", {})).toBe("/clients");
  });

  it("serializes arrays and booleans", () => {
    expect(buildSearchParams({}, { status: ["design", "planning"], archived: true }).toString()).toBe(
      "status=design%2Cplanning&archived=1",
    );
    expect(buildSearchParams({ archived: "1" }, { archived: false }).toString()).toBe("");
  });
});

describe("PostgREST filter helpers", () => {
  it("escapes LIKE wildcards", () => {
    expect(escapeLikePattern("100%_done\\")).toBe("100\\%\\_done\\\\");
  });

  it("quotes values so commas and parentheses can't inject filters", () => {
    expect(ilikeAnyFilter(["name", "client_code"], "kumar")).toBe('name.ilike."%kumar%",client_code.ilike."%kumar%"');
    expect(ilikeAnyFilter(["name"], 'a,b),id.eq.1"')).toBe('name.ilike."%a,b),id.eq.1\\"%"');
  });
});
