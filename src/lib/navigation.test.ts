import { describe, expect, it } from "vitest";
import { canAccessRoute, getNavItems, isNavActive, isPublicPath, isRoleRestricted, safeNextPath } from "./navigation";

describe("role navigation", () => {
  it("matches app.md §38 order", () => {
    expect(getNavItems("owner").map((i) => i.label)).toEqual([
      "Dashboard",
      "Clients",
      "Projects",
      "Site Managers",
      "Admins",
      "Material Requests",
      "Materials",
      "Reports",
      "Activity",
      "Users",
      "Settings",
    ]);
    expect(getNavItems("site_manager").map((i) => i.label)).toEqual([
      "Dashboard",
      "My Projects",
      "Material Requests",
      "Materials",
      "Reports",
      "Activity",
      "Profile",
    ]);
    expect(getNavItems("admin").map((i) => i.label)).toEqual([
      "Dashboard",
      "Material Requests",
      "Materials",
      "Projects",
      "Reports",
      "Activity",
      "Profile",
    ]);
  });

  it("marks the most specific item active", () => {
    const hrefs = ["/material-requests", "/material-requests/new"];
    expect(isNavActive("/material-requests/abc", "/material-requests", hrefs)).toBe(true);
    expect(isNavActive("/material-requests/new", "/material-requests", hrefs)).toBe(false);
    expect(isNavActive("/material-requests/new", "/material-requests/new", hrefs)).toBe(true);
    expect(isNavActive("/projects-archive", "/projects")).toBe(false);
  });
});

describe("route access", () => {
  it("restricts owner-only areas", () => {
    for (const path of ["/clients/new", "/clients/1/edit", "/site-managers", "/admins/x", "/users", "/settings"]) {
      expect(canAccessRoute(path, "owner")).toBe(true);
      expect(canAccessRoute(path, "admin")).toBe(false);
      expect(canAccessRoute(path, "site_manager")).toBe(false);
    }
  });

  it("lets site managers see their assigned clients but never admins (ARCHITECTURE §9)", () => {
    for (const path of ["/clients", "/clients/abc"]) {
      expect(canAccessRoute(path, "owner")).toBe(true);
      expect(canAccessRoute(path, "site_manager")).toBe(true);
      expect(canAccessRoute(path, "admin")).toBe(false);
    }
  });

  it("opens reports to every role; the page and CSV route limit report types", () => {
    for (const path of ["/reports", "/api/reports/materials"]) {
      expect(canAccessRoute(path, "owner")).toBe(true);
      expect(canAccessRoute(path, "admin")).toBe(true);
      expect(canAccessRoute(path, "site_manager")).toBe(true);
    }
  });

  it("applies the most specific project rule", () => {
    expect(canAccessRoute("/projects", "admin")).toBe(true);
    expect(canAccessRoute("/projects/abc", "site_manager")).toBe(true);
    expect(canAccessRoute("/projects/new", "site_manager")).toBe(false);
    expect(canAccessRoute("/projects/abc/edit", "site_manager")).toBe(false);
    expect(canAccessRoute("/projects/abc/update", "site_manager")).toBe(true);
    expect(canAccessRoute("/projects/abc/update", "admin")).toBe(false);
    expect(canAccessRoute("/material-requests/new", "admin")).toBe(false);
    expect(canAccessRoute("/material-requests/new", "site_manager")).toBe(true);
  });

  it("knows which paths need a role lookup", () => {
    expect(isRoleRestricted("/dashboard")).toBe(false);
    expect(isRoleRestricted("/clients")).toBe(true);
    expect(isRoleRestricted("/projects/1")).toBe(false);
    expect(isRoleRestricted("/projects/new")).toBe(true);
  });

  it("identifies public paths", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/confirm")).toBe(true);
    expect(isPublicPath("/reset-password")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/authors")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("only allows same-origin app paths", () => {
    expect(safeNextPath("/projects/1?tab=updates")).toBe("/projects/1?tab=updates");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("/login")).toBe("/dashboard");
    expect(safeNextPath("/auth/signout")).toBe("/dashboard");
    expect(safeNextPath(null)).toBe("/dashboard");
  });
});
