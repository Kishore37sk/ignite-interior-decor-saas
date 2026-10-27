import { describe, expect, it } from "vitest";
import { diffChanges } from "./diff";
import { activityHref, entityTypesForRole } from "./entities";

describe("diffChanges", () => {
  it("lists only changed, non-noisy keys", () => {
    const changes = diffChanges(
      { status: "design", progress_percentage: 40, updated_at: "a", name: "Villa" },
      { status: "execution", progress_percentage: 55, updated_at: "b", name: "Villa" },
    );
    expect(changes).toEqual([
      { field: "status", before: "design", after: "execution" },
      { field: "progress_percentage", before: 40, after: 55 },
    ]);
  });
  it("returns null for inserts/deletes or no changes", () => {
    expect(diffChanges(null, { a: 1 })).toBeNull();
    expect(diffChanges({ a: 1 }, null)).toBeNull();
    expect(diffChanges({ updated_at: "x" }, { updated_at: "y" })).toBeNull();
  });
});

describe("activityHref", () => {
  const base = { entity_id: "e1", project_id: "p1", metadata: { request_id: "r1" }, action: "update" };
  it("links project children to the right project tab", () => {
    expect(activityHref({ ...base, entity_type: "project_updates" }, "site_manager")).toBe("/projects/p1?tab=updates");
    expect(activityHref({ ...base, entity_type: "projects" }, "owner")).toBe("/projects/e1");
  });
  it("links request items to their request", () => {
    expect(activityHref({ ...base, entity_type: "material_deliveries" }, "admin")).toBe("/material-requests/r1");
  });
  it("hides pages the viewer cannot open", () => {
    expect(activityHref({ ...base, entity_type: "clients" }, "admin")).toBeNull();
    expect(activityHref({ ...base, entity_type: "company_settings" }, "site_manager")).toBeNull();
    expect(activityHref({ ...base, entity_type: "project_financials" }, "site_manager")).toBeNull();
    expect(activityHref({ ...base, entity_type: "project_payments" }, "site_manager")).toBeNull();
  });
  it("links payment rows to the payments tab for the owner", () => {
    expect(activityHref({ ...base, entity_type: "project_payments" }, "owner")).toBe("/projects/p1?tab=payments");
  });
});

describe("entityTypesForRole", () => {
  it("never offers owner-only entity types to staff", () => {
    for (const role of ["admin", "site_manager"] as const) {
      const types = entityTypesForRole(role);
      expect(types).not.toContain("project_financials");
      expect(types).not.toContain("project_payments");
      expect(types).not.toContain("clients");
    }
  });
});
