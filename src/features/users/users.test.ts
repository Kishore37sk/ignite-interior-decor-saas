import { describe, expect, it } from "vitest";
import { nextEmployeeId } from "./employee-id";
import { createUserSchema, updateUserSchema } from "./schemas";

describe("nextEmployeeId", () => {
  it("starts at 001 when no ids exist", () => {
    expect(nextEmployeeId("SM", [])).toBe("SM001");
  });
  it("continues after the highest matching id, ignoring other prefixes and case", () => {
    expect(nextEmployeeId("SM", ["SM001", "sm-007", "AD010", null, "SMX"])).toBe("SM008");
    expect(nextEmployeeId("AD", ["SM001", "AD002", "AD010"])).toBe("AD011");
  });
  it("keeps wider padding when ids already use it", () => {
    expect(nextEmployeeId("SM", ["SM0099"])).toBe("SM0100");
  });
});

describe("createUserSchema", () => {
  const base = { full_name: " Arjun Rao ", email: "Arjun@Example.com", role: "site_manager" };

  it("normalises email, name and optional fields", () => {
    const parsed = createUserSchema.parse({ ...base, phone: "", employee_id: " sm003 ", joining_date: "" });
    expect(parsed).toEqual({
      full_name: "Arjun Rao",
      email: "arjun@example.com",
      phone: null,
      role: "site_manager",
      employee_id: "SM003",
      joining_date: null,
    });
  });
  it("rejects the owner role and bad employee ids", () => {
    expect(createUserSchema.safeParse({ ...base, role: "owner" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, employee_id: "SM 003" }).success).toBe(false);
  });
  it("validates phone and date formats", () => {
    expect(createUserSchema.safeParse({ ...base, phone: "12" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, joining_date: "2026-02-30" }).success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  it("does not accept email or role changes", () => {
    const parsed = updateUserSchema.parse({ full_name: "A", email: "x@y.com", role: "admin" });
    expect(parsed).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("role");
  });
});
