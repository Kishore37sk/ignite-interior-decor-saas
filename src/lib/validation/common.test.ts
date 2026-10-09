import { describe, expect, it } from "vitest";
import {
  dateOnly,
  email,
  formDataToObject,
  isValidPhone,
  money,
  optionalDate,
  optionalMoney,
  optionalPhone,
  optionalText,
  percentage,
  phone,
  quantity,
  uuid,
} from "./common";

describe("phone", () => {
  it("accepts Indian and E.164 formats", () => {
    for (const value of ["9845012345", "+91 98450 12345", "+91-98450-12345", "098450 12345", "080-1234-5678", "+1 (415) 555-0123"]) {
      expect(isValidPhone(value)).toBe(true);
    }
  });

  it("rejects junk", () => {
    for (const value of ["12345", "5845012345", "abcdefghij", "+0123456789"]) {
      expect(isValidPhone(value)).toBe(false);
    }
  });

  it("normalises and treats empty optional phones as null", () => {
    expect(phone.parse("+91 98450 12345")).toBe("+919845012345");
    expect(optionalPhone.parse("")).toBeNull();
    expect(optionalPhone.safeParse("123").success).toBe(false);
  });
});

describe("email / uuid / text", () => {
  it("normalises emails", () => {
    expect(email.parse("  Kishore@Ignite.COM ")).toBe("kishore@ignite.com");
    expect(email.safeParse("not-an-email").success).toBe(false);
  });

  it("accepts any hex uuid shape", () => {
    expect(uuid.parse("00000000-0000-0000-0000-000000000001")).toBe("00000000-0000-0000-0000-000000000001");
    expect(uuid.safeParse("1").success).toBe(false);
  });

  it("maps empty optional text to null", () => {
    const schema = optionalText(10);
    expect(schema.parse("   ")).toBeNull();
    expect(schema.parse(" hi ")).toBe("hi");
    expect(schema.safeParse("x".repeat(11)).success).toBe(false);
  });
});

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(dateOnly.parse("2026-10-08")).toBe("2026-10-08");
    expect(dateOnly.safeParse("2026-02-30").success).toBe(false);
    expect(optionalDate.parse("")).toBeNull();
    expect(optionalDate.parse(null)).toBeNull();
  });
});

describe("numbers", () => {
  it("parses money from form strings", () => {
    expect(money.parse("4,20,000")).toBe(420000);
    expect(money.parse("₹ 1,250.50")).toBe(1250.5);
    expect(money.safeParse("-1").success).toBe(false);
    expect(money.safeParse("12.345").success).toBe(false);
    expect(money.safeParse("").success).toBe(false);
    expect(optionalMoney.parse("")).toBeNull();
  });

  it("requires positive quantities", () => {
    expect(quantity.parse("12.5")).toBe(12.5);
    expect(quantity.safeParse("0").success).toBe(false);
    expect(quantity.safeParse("abc").success).toBe(false);
  });

  it("bounds percentages", () => {
    expect(percentage.parse("45")).toBe(45);
    expect(percentage.parse(100)).toBe(100);
    expect(percentage.safeParse(101).success).toBe(false);
    expect(percentage.safeParse(-1).success).toBe(false);
  });
});

describe("formDataToObject", () => {
  it("collects repeated keys and drops empty files and Next internals", () => {
    const fd = new FormData();
    fd.append("name", "Villa");
    fd.append("tag", "a");
    fd.append("tag", "b");
    fd.append("$ACTION_ID_123", "");
    fd.append("file", new File([], "empty.png"));
    expect(formDataToObject(fd)).toEqual({ name: "Villa", tag: ["a", "b"] });
  });
});
