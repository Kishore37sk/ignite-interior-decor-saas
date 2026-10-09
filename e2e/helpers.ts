import { expect, type Page } from "@playwright/test";

export type RoleKey = "owner" | "admin" | "sm";

export type Credentials = { email: string; password: string };

const ENV_PREFIX: Record<RoleKey, string> = {
  owner: "E2E_OWNER",
  admin: "E2E_ADMIN",
  sm: "E2E_SM",
};

/** Credentials for a role from `E2E_<ROLE>_EMAIL` / `E2E_<ROLE>_PASSWORD`, or null. */
export function credentials(role: RoleKey): Credentials | null {
  const email = process.env[`${ENV_PREFIX[role]}_EMAIL`];
  const password = process.env[`${ENV_PREFIX[role]}_PASSWORD`];
  return email && password ? { email, password } : null;
}

export function hasAnyCredentials(): boolean {
  return (["owner", "admin", "sm"] as const).some((role) => credentials(role) !== null);
}

export async function fillLogin(page: Page, { email, password }: Credentials): Promise<void> {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

/** Sign in from /login and wait for the dashboard. */
export async function login(page: Page, creds: Credentials): Promise<void> {
  await page.goto("/login");
  await fillLogin(page, creds);
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Sign out through the account menu. */
export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Account menu for/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?message=signed_out/);
}

/** Navigate and assert the role guard sent us to /forbidden. */
export async function expectForbidden(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole("heading", { name: "You don't have access to this page" })).toBeVisible();
}

/** Navigate and assert the role guard let us through (the page itself may still 404). */
export async function expectAllowed(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page).not.toHaveURL(/\/(forbidden|login)/);
}

export function sidebar(page: Page) {
  return page.getByRole("navigation", { name: "Main navigation" });
}
