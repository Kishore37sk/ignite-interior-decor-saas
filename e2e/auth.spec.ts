import { expect, test } from "@playwright/test";
import {
  credentials,
  expectAllowed,
  expectForbidden,
  fillLogin,
  hasAnyCredentials,
  login,
  logout,
  sidebar,
} from "./helpers";

/*
 * Auth & role-guard flows. Role tests need real accounts in the target Supabase project:
 *   E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 *   E2E_SM_EMAIL    / E2E_SM_PASSWORD
 * Tests whose credentials are missing are skipped.
 */

test.describe("login page", () => {
  test("shows the branded sign-in form without a sign-up link", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByText("Ignite Interior Decor").first()).toBeVisible();
    await expect(page.getByText("Project Management Portal").first()).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up|register|create account/i })).toHaveCount(0);
  });

  test("toggles password visibility", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("secret-value");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
  });

  test("validates empty submissions before contacting Supabase", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
  });

  test("redirects anonymous users to login and keeps the target", async ({ page }) => {
    await page.goto("/projects?status=design");
    await expect(page).toHaveURL(/\/login\?next=%2Fprojects%3Fstatus%3Ddesign$/);
  });

  test("returns 401 JSON for anonymous API calls", async ({ request }) => {
    const response = await request.get("/api/search?q=kumar");
    expect(response.status()).toBe(401);
  });

  test("forgot password links back to sign in", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
    await page.getByRole("link", { name: "Back to sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("invalid login", () => {
  test.skip(!hasAnyCredentials(), "Set E2E_* credentials to run tests against Supabase Auth");

  test("shows a friendly error for wrong credentials", async ({ page }) => {
    const creds = credentials("owner") ?? credentials("admin") ?? credentials("sm");
    test.skip(!creds, "no credentials");
    await page.goto("/login");
    await fillLogin(page, { email: creds!.email, password: `${creds!.password}-wrong` });
    // Next.js also renders a route announcer with role="alert", so match the form error by its text.
    await expect(page.getByRole("alert").filter({ hasText: "Incorrect email or password." })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel("Email")).toHaveValue(creds!.email);
  });
});

test.describe("owner", () => {
  const creds = credentials("owner");
  test.skip(!creds, "Set E2E_OWNER_EMAIL / E2E_OWNER_PASSWORD");

  test("signs in, sees the full navigation and signs out", async ({ page }) => {
    await login(page, creds!);
    await expect(page.getByText(/^Good (Morning|Afternoon|Evening)$/)).toBeVisible();
    const nav = sidebar(page);
    for (const label of ["Clients", "Site Managers", "Admins", "Reports", "Users", "Settings"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
    await logout(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("can open owner-only areas", async ({ page }) => {
    await login(page, creds!);
    for (const path of ["/clients", "/site-managers", "/admins", "/reports", "/users", "/settings", "/projects/new"]) {
      await expectAllowed(page, path);
    }
  });

  test("is redirected away from the login page while signed in", async ({ page }) => {
    await login(page, creds!);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("ignores off-site redirect targets after login", async ({ page }) => {
    await page.goto("/login?next=//evil.example.com");
    await fillLogin(page, creds!);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("returns to the requested page after login", async ({ page }) => {
    await page.goto("/activity");
    await expect(page).toHaveURL(/\/login\?next=%2Factivity$/);
    await fillLogin(page, creds!);
    await expect(page).toHaveURL(/\/activity$/);
  });
});

test.describe("admin", () => {
  const creds = credentials("admin");
  test.skip(!creds, "Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

  test("sees only admin navigation", async ({ page }) => {
    await login(page, creds!);
    const nav = sidebar(page);
    await expect(nav.getByRole("link", { name: "Material Requests" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Reports" })).toBeVisible();
    for (const label of ["Clients", "Site Managers", "Admins", "Users", "Settings"]) {
      await expect(nav.getByRole("link", { name: label })).toHaveCount(0);
    }
  });

  test("is forbidden from owner and site-manager routes", async ({ page }) => {
    await login(page, creds!);
    for (const path of ["/clients", "/users", "/settings", "/site-managers", "/material-requests/new", "/projects/new"]) {
      await expectForbidden(page, path);
    }
    await expectAllowed(page, "/material-requests");
    // Admins get the RLS-scoped material report only.
    await expectAllowed(page, "/reports");
    await logout(page);
  });
});

test.describe("site manager", () => {
  const creds = credentials("sm");
  test.skip(!creds, "Set E2E_SM_EMAIL / E2E_SM_PASSWORD");

  test("sees site manager navigation", async ({ page }) => {
    await login(page, creds!);
    const nav = sidebar(page);
    await expect(nav.getByRole("link", { name: "My Projects" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Reports" })).toBeVisible();
    for (const label of ["Clients", "Admins", "Users", "Settings"]) {
      await expect(nav.getByRole("link", { name: label })).toHaveCount(0);
    }
  });

  test("is forbidden from owner routes but can raise requests", async ({ page }) => {
    await login(page, creds!);
    for (const path of ["/clients/new", "/users", "/settings", "/admins", "/projects/new"]) {
      await expectForbidden(page, path);
    }
    await expectAllowed(page, "/material-requests/new");
    // Assigned clients and the RLS-scoped material report are allowed (ARCHITECTURE §9).
    await expectAllowed(page, "/clients");
    await expectAllowed(page, "/reports");
    await logout(page);
  });

  test("gets the bottom navigation on mobile @mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, creds!);
    const bottomNav = page.getByRole("navigation", { name: "Quick navigation" });
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole("link", { name: "New Request" })).toBeVisible();
  });
});
