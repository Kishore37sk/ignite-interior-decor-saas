/**
 * Role-based navigation (app.md §38) and the route → roles access map shared by
 * `middleware.ts` and `requireRole()`. Kept free of React imports so the edge
 * middleware can use it; icons are referenced by lucide-react component name and
 * resolved in `components/shell/nav-icons.tsx`.
 */
import type { AppRole } from "@/types/database";

export const ALL_ROLES = ["owner", "admin", "site_manager"] as const satisfies readonly AppRole[];

export type NavIconName =
  | "LayoutDashboard"
  | "Contact"
  | "FolderKanban"
  | "HardHat"
  | "ShieldCheck"
  | "ClipboardList"
  | "Package"
  | "ChartColumn"
  | "Activity"
  | "UsersRound"
  | "Settings"
  | "UserRound"
  | "Plus";

export type NavItem = {
  label: string;
  href: string;
  icon: NavIconName;
};

const NAV = {
  dashboard: { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  clients: { label: "Clients", href: "/clients", icon: "Contact" },
  projects: { label: "Projects", href: "/projects", icon: "FolderKanban" },
  myProjects: { label: "My Projects", href: "/projects", icon: "FolderKanban" },
  siteManagers: { label: "Site Managers", href: "/site-managers", icon: "HardHat" },
  admins: { label: "Admins", href: "/admins", icon: "ShieldCheck" },
  materialRequests: { label: "Material Requests", href: "/material-requests", icon: "ClipboardList" },
  materials: { label: "Materials", href: "/materials", icon: "Package" },
  reports: { label: "Reports", href: "/reports", icon: "ChartColumn" },
  activity: { label: "Activity", href: "/activity", icon: "Activity" },
  users: { label: "Users", href: "/users", icon: "UsersRound" },
  settings: { label: "Settings", href: "/settings", icon: "Settings" },
  profile: { label: "Profile", href: "/profile", icon: "UserRound" },
} as const satisfies Record<string, NavItem>;

/**
 * Sidebar items per role, in display order (app.md §38). Reports is added for admins
 * and site managers because §85 / ARCHITECTURE §9 give them a limited material report.
 */
export const NAV_ITEMS: Record<AppRole, readonly NavItem[]> = {
  owner: [
    NAV.dashboard,
    NAV.clients,
    NAV.projects,
    NAV.siteManagers,
    NAV.admins,
    NAV.materialRequests,
    NAV.materials,
    NAV.reports,
    NAV.activity,
    NAV.users,
    NAV.settings,
  ],
  site_manager: [
    NAV.dashboard,
    NAV.myProjects,
    NAV.materialRequests,
    NAV.materials,
    NAV.reports,
    NAV.activity,
    NAV.profile,
  ],
  admin: [
    NAV.dashboard,
    NAV.materialRequests,
    NAV.materials,
    NAV.projects,
    NAV.reports,
    NAV.activity,
    NAV.profile,
  ],
};

export function getNavItems(role: AppRole): readonly NavItem[] {
  return NAV_ITEMS[role];
}

export type BottomNavItem = NavItem & { prominent?: boolean };

/** Fixed mobile bottom navigation for site managers (app.md §59). */
export const SITE_MANAGER_BOTTOM_NAV: readonly BottomNavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Projects", href: "/projects", icon: "FolderKanban" },
  { label: "New Request", href: "/material-requests/new", icon: "Plus", prominent: true },
  { label: "Requests", href: "/material-requests", icon: "ClipboardList" },
  { label: "Profile", href: "/profile", icon: "UserRound" },
];

/**
 * True when `href` should render as active for `pathname`. Exact match, or a
 * sub-path — except that `/material-requests` stays inactive on `/material-requests/new`
 * when a more specific item (`exactOnly`) owns that path.
 */
export function isNavActive(pathname: string, href: string, siblingHrefs: readonly string[] = []): boolean {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  // A more specific sibling (e.g. /material-requests/new) wins.
  return !siblingHrefs.some(
    (other) => other !== href && other.startsWith(`${href}/`) && (pathname === other || pathname.startsWith(`${other}/`)),
  );
}

/* -------------------------------------------------------------------------- */
/* Route access                                                               */
/* -------------------------------------------------------------------------- */

type RouteRule = { pattern: string; roles: readonly AppRole[] };

const OWNER: readonly AppRole[] = ["owner"];
const OWNER_SM: readonly AppRole[] = ["owner", "site_manager"];

/**
 * Role restrictions by path pattern (`*` matches one segment; a rule also covers all
 * sub-paths). The most specific (longest) matching rule wins. Paths with no rule are
 * open to every active user (RLS still limits the data they see).
 */
export const ROUTE_RULES: readonly RouteRule[] = [
  { pattern: "/dashboard", roles: ALL_ROLES },
  { pattern: "/clients", roles: OWNER_SM },
  { pattern: "/clients/new", roles: OWNER },
  { pattern: "/clients/*/edit", roles: OWNER },
  { pattern: "/projects", roles: ALL_ROLES },
  { pattern: "/projects/new", roles: OWNER },
  { pattern: "/projects/*/edit", roles: OWNER },
  { pattern: "/projects/*/update", roles: OWNER_SM },
  { pattern: "/site-managers", roles: OWNER },
  { pattern: "/admins", roles: OWNER },
  { pattern: "/material-requests", roles: ALL_ROLES },
  { pattern: "/material-requests/new", roles: OWNER_SM },
  { pattern: "/materials", roles: ALL_ROLES },
  // Owner gets every report; admins and site managers get the RLS-scoped material
  // report only (enforced per report type by the page and the CSV route).
  { pattern: "/reports", roles: ALL_ROLES },
  { pattern: "/api/reports", roles: ALL_ROLES },
  { pattern: "/activity", roles: ALL_ROLES },
  { pattern: "/users", roles: OWNER },
  { pattern: "/settings", roles: OWNER },
  { pattern: "/profile", roles: ALL_ROLES },
];

function segments(path: string): string[] {
  return path.split("?")[0]!.split("#")[0]!.split("/").filter(Boolean);
}

const COMPILED_RULES = ROUTE_RULES.map((rule) => ({ ...rule, parts: segments(rule.pattern) })).sort(
  (a, b) => b.parts.length - a.parts.length,
);

function matches(ruleParts: readonly string[], pathParts: readonly string[]): boolean {
  if (pathParts.length < ruleParts.length) return false;
  return ruleParts.every((part, i) => part === "*" || part === pathParts[i]);
}

/** Roles allowed on `pathname`, or `null` when the path has no role restriction. */
export function getRouteRoles(pathname: string): readonly AppRole[] | null {
  const parts = segments(pathname);
  for (const rule of COMPILED_RULES) {
    if (matches(rule.parts, parts)) return rule.roles;
  }
  return null;
}

/** Whether `role` may open `pathname`. */
export function canAccessRoute(pathname: string, role: AppRole): boolean {
  const roles = getRouteRoles(pathname);
  return roles === null || roles.includes(role);
}

/** True when a path needs a role check beyond "signed in and active". */
export function isRoleRestricted(pathname: string): boolean {
  const roles = getRouteRoles(pathname);
  return roles !== null && roles.length < ALL_ROLES.length;
}

/* -------------------------------------------------------------------------- */
/* Public paths & redirects                                                   */
/* -------------------------------------------------------------------------- */

export const LOGIN_PATH = "/login";
export const HOME_PATH = "/dashboard";
export const FORBIDDEN_PATH = "/forbidden";

const PUBLIC_EXACT = new Set(["/login", "/forgot-password", "/reset-password"]);

/** Paths reachable without a session (`/statement/<token>` is the client payment statement). */
export function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT.has(pathname) ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/statement/")
  );
}

/**
 * Sanitize a post-login redirect target: must be a same-origin absolute path
 * (starts with "/" but not "//" or "/\"), and never an auth page.
 */
export function safeNextPath(next: string | null | undefined, fallback: string = HOME_PATH): string {
  if (!next || typeof next !== "string") return fallback;
  const value = next.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001F\u007F]/.test(value)) return fallback;
  const path = value.split(/[?#]/)[0] ?? "";
  if (path === LOGIN_PATH || path.startsWith("/auth/")) return fallback;
  return value;
}
