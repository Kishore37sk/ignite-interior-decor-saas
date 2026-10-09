import { describe, expect, it } from "vitest";
import { CSV_BOM, csvFileName, csvResponse, escapeCsvCell, toCSV, type CsvColumn } from "./csv";

type Row = { code: string; name: string; cost: number | null; notes: string | null; active: boolean };

const columns: CsvColumn<Row>[] = [
  { header: "Code", value: "code" },
  { header: "Name", value: "name" },
  { header: "Cost (₹)", value: "cost" },
  { header: "Notes", value: (row) => row.notes },
  { header: "Active", value: "active" },
];

describe("escapeCsvCell", () => {
  it("leaves simple values alone", () => {
    expect(escapeCsvCell("Cement")).toBe("Cement");
    expect(escapeCsvCell(420000)).toBe("420000");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
    expect(escapeCsvCell(true)).toBe("Yes");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(escapeCsvCell("Tiles, 800 Sq Ft")).toBe('"Tiles, 800 Sq Ft"');
    expect(escapeCsvCell('12" pipe')).toBe('"12"" pipe"');
    expect(escapeCsvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(escapeCsvCell("a\r\nb")).toBe('"a\r\nb"');
    expect(escapeCsvCell(" padded ")).toBe('" padded "');
  });

  it("neutralises spreadsheet formulas in text but not numbers", () => {
    expect(escapeCsvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(escapeCsvCell("+91 98450 12345")).toBe("'+91 98450 12345");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell(-500)).toBe("-500");
  });
});

describe("toCSV", () => {
  const rows: Row[] = [
    { code: "P-1001", name: "Kumar Residence", cost: 1250000, notes: null, active: true },
    { code: "P-1002", name: "Villa, Phase 2", cost: null, notes: 'Client said "rush"', active: false },
  ];

  it("starts with a BOM and uses CRLF line endings", () => {
    const csv = toCSV(rows, columns);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toEqual([
      "Code,Name,Cost (₹),Notes,Active",
      "P-1001,Kumar Residence,1250000,,Yes",
      'P-1002,"Villa, Phase 2",,"Client said ""rush""",No',
      "",
    ]);
  });

  it("can omit the BOM and still emits headers for empty data", () => {
    expect(toCSV([], columns, { bom: false })).toBe("Code,Name,Cost (₹),Notes,Active\r\n");
  });
});

describe("csv helpers", () => {
  it("builds safe file names", () => {
    expect(csvFileName("Projects Report", "2026-10-08")).toBe("projects-report-2026-10-08.csv");
    expect(csvFileName("../../etc/passwd")).toBe("etc-passwd.csv");
    expect(csvFileName("")).toBe("export.csv");
  });

  it("returns a download response", async () => {
    const response = csvResponse("a,b\r\n", "report.csv");
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="report.csv"');
    expect(await response.text()).toBe("a,b\r\n");
  });
});
