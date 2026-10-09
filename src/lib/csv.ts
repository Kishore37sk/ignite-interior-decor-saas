/**
 * RFC 4180 CSV generation for report exports (opens cleanly in Excel).
 * - Fields containing `,` `"` CR or LF (or leading/trailing spaces) are quoted; quotes are doubled.
 * - Text cells starting with `=`, `+`, `-`, `@`, TAB or CR are prefixed with `'` to prevent
 *   spreadsheet formula injection (numbers are left untouched).
 * - Output starts with a UTF-8 BOM by default so Excel detects UTF-8 (₹, accented names).
 */

export const CSV_BOM = "﻿";
const LINE_BREAK = "\r\n";

export type CsvValue = string | number | boolean | Date | null | undefined;

export type CsvColumn<T> = {
  header: string;
  /** Property key or accessor returning the cell value. */
  value: keyof T | ((row: T) => CsvValue);
};

export type ToCsvOptions = {
  /** Prepend the UTF-8 byte-order mark (default `true`). */
  bom?: boolean;
};

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

function stringify(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

/** Escape a single cell. */
export function escapeCsvCell(value: CsvValue): string {
  let text = stringify(value);
  if (typeof value === "string" && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cellValue<T>(row: T, column: CsvColumn<T>): CsvValue {
  if (typeof column.value === "function") return column.value(row);
  const raw: unknown = row[column.value];
  if (
    raw === null ||
    raw === undefined ||
    typeof raw === "string" ||
    typeof raw === "number" ||
    typeof raw === "boolean" ||
    raw instanceof Date
  ) {
    return raw;
  }
  return JSON.stringify(raw);
}

/** Convert rows to CSV text using the column definitions (header row first). */
export function toCSV<T>(rows: readonly T[], columns: readonly CsvColumn<T>[], options: ToCsvOptions = {}): string {
  const { bom = true } = options;
  const lines = [columns.map((c) => escapeCsvCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvCell(cellValue(row, c))).join(","));
  }
  return (bom ? CSV_BOM : "") + lines.join(LINE_BREAK) + LINE_BREAK;
}

/** Filesystem/header-safe file name: `Projects Report` → `projects-report-2026-10-08.csv`. */
export function csvFileName(base: string, date?: string): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export";
  return `${slug}${date ? `-${date}` : ""}.csv`;
}

/** HTTP response that downloads `csv` as an attachment (never cached). */
export function csvResponse(csv: string, fileName: string): Response {
  const safeName = fileName.replace(/[^\w.-]+/g, "_");
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
