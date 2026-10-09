import { describe, expect, it } from "vitest";
import {
  firstName,
  formatCompactNumber,
  formatFileSize,
  formatINR,
  formatNumber,
  formatPercent,
  formatQuantity,
  humanize,
  initials,
  pluralize,
  truncate,
} from "./format";

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(420000)).toBe("₹4,20,000");
    expect(formatINR(12345678)).toBe("₹1,23,45,678");
    expect(formatINR(999)).toBe("₹999");
    expect(formatINR(0)).toBe("₹0");
  });

  it("shows paise only for fractional amounts", () => {
    expect(formatINR(1234.5)).toBe("₹1,234.50");
    expect(formatINR(1234.005)).toBe("₹1,234.01");
  });

  it("handles negatives, numeric strings and missing values", () => {
    expect(formatINR(-25000)).toBe("-₹25,000");
    expect(formatINR("150000")).toBe("₹1,50,000");
    expect(formatINR(null)).toBe("—");
    expect(formatINR("abc", { fallback: "N/A" })).toBe("N/A");
  });

  it("abbreviates to lakh and crore in compact mode", () => {
    expect(formatINR(420000, { compact: true })).toBe("₹4.2L");
    expect(formatINR(100000, { compact: true })).toBe("₹1L");
    expect(formatINR(12500000, { compact: true })).toBe("₹1.25Cr");
    expect(formatINR(120000000, { compact: true })).toBe("₹12Cr");
    expect(formatINR(99999, { compact: true })).toBe("₹99,999");
    expect(formatINR(-450000, { compact: true })).toBe("-₹4.5L");
  });

  it("moves to the next unit when rounding reaches it", () => {
    expect(formatINR(9_999_999, { compact: true })).toBe("₹1Cr");
    expect(formatINR(9_999_960, { compact: true })).toBe("₹1Cr");
    expect(formatINR(9_996_000, { compact: true })).toBe("₹99.96L");
    expect(formatINR(-9_999_999, { compact: true })).toBe("-₹1Cr");
  });
});

describe("number helpers", () => {
  it("formats numbers with Indian grouping", () => {
    expect(formatNumber(1234567)).toBe("12,34,567");
    expect(formatNumber(12.345)).toBe("12.35");
    expect(formatNumber(12.345, 0)).toBe("12");
  });

  it("formats compact counts", () => {
    expect(formatCompactNumber(1500)).toBe("1.5K");
    expect(formatCompactNumber(250000)).toBe("2.5L");
    expect(formatCompactNumber(12000000)).toBe("1.2Cr");
    expect(formatCompactNumber(42)).toBe("42");
  });

  it("promotes compact counts at unit boundaries", () => {
    expect(formatCompactNumber(99_999)).toBe("1L");
    expect(formatCompactNumber(99_500)).toBe("99.5K");
    expect(formatCompactNumber(9_996_000)).toBe("1Cr");
    expect(formatCompactNumber(999.96)).toBe("1K");
    expect(formatCompactNumber(999)).toBe("999");
  });

  it("formats percentages and quantities", () => {
    expect(formatPercent(45)).toBe("45%");
    expect(formatPercent(12.345, 1)).toBe("12.3%");
    expect(formatPercent(null)).toBe("—");
    expect(formatQuantity(100, "Bags")).toBe("100 Bags");
    expect(formatQuantity(1250.5, "Sq Ft")).toBe("1,250.5 Sq Ft");
  });

  it("formats file sizes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });
});

describe("text helpers", () => {
  it("builds initials", () => {
    expect(initials("Kishore Kumar M")).toBe("KM");
    expect(initials("kishore")).toBe("K");
    expect(initials("admin@ignite.com")).toBe("A");
    expect(initials("")).toBe("?");
  });

  it("extracts first names, pluralizes, truncates and humanizes", () => {
    expect(firstName("  Kishore Kumar ")).toBe("Kishore");
    expect(pluralize(1, "project")).toBe("1 project");
    expect(pluralize(3, "project")).toBe("3 projects");
    expect(truncate("Living room   false ceiling work", 15)).toBe("Living room fa…");
    expect(humanize("handover_pending")).toBe("Handover Pending");
  });
});
