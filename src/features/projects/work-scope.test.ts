import { describe, expect, it } from "vitest";
import { formatWorkScope, WORK_SCOPES } from "@/lib/constants";
import { projectFormSchema } from "./schemas";
import { PROJECT_TYPE_SUGGESTIONS } from "./constants";

const base = { client_id: "11111111-1111-4111-8111-111111111111", name: "Test", status: "planning", priority: "medium", progress_percentage: "0" };

describe("project scope of work", () => {
  it("accepts one, many or no areas and keeps the canonical order", () => {
    expect(projectFormSchema.parse({ ...base, work_scope: "pooja_unit" }).work_scope).toEqual(["pooja_unit"]);
    expect(projectFormSchema.parse({ ...base, work_scope: ["tv_unit", "living_room"] }).work_scope).toEqual([
      "living_room",
      "tv_unit",
    ]);
    expect(projectFormSchema.parse(base).work_scope).toEqual([]);
  });

  it("rejects unknown areas", () => {
    expect(projectFormSchema.safeParse({ ...base, work_scope: ["garage"] }).success).toBe(false);
  });

  it("formats the scope for display", () => {
    expect(formatWorkScope([])).toBeNull();
    expect(formatWorkScope(["modular_kitchen", "2bhk"])).toBe("Modular Kitchen, 2BHK");
    expect(formatWorkScope([...WORK_SCOPES])).toBe("All areas");
  });

  it("keeps rooms out of the project type suggestions", () => {
    for (const room of ["Living Room", "Modular Kitchen", "Dining", "Pooja Unit", "1BHK", "2BHK", "3BHK", "Home Theatre", "False Ceiling", "TV Unit"]) {
      expect(PROJECT_TYPE_SUGGESTIONS).not.toContain(room);
    }
    expect(PROJECT_TYPE_SUGGESTIONS).toEqual(expect.arrayContaining(["Villa", "Apartment", "Residential"]));
    expect(PROJECT_TYPE_SUGGESTIONS.at(-1)).toBe("Other");
  });
});
