import { NextResponse, type NextRequest } from "next/server";
import {
  FORBIDDEN_PATH,
  HOME_PATH,
  LOGIN_PATH,
  canAccessRoute,
  isPublicPath,
  isRoleRestricted,
} from "@/lib/navigation";
import { redirectWithCookies, updateSession } from "@/lib/supabase/middleware";

/**
 * - Refreshes the Supabase session cookie on every matched request.
 * - Verifies the user with `auth.getUser()` and protects every non-public path.
 * - Enforces the shared route → roles map for role-restricted paths.
 * Pages still call `requireUser()` / `requireRole()`; RLS is the final authority.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await updateSession(request);
  const { user, supabase } = session;
  const isApi = pathname.startsWith("/api/");

  if (!user) {
    if (isPublicPath(pathname)) return session.response;
    if (isApi) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const loginUrl = new URL(LOGIN_PATH, request.url);
    if (pathname !== "/" && pathname !== HOME_PATH) {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }
    return redirectWithCookies(session.response, loginUrl);
  }

  // Signed-in users don't need the login page — unless it is explaining why they were
  // signed out (e.g. `?error=inactive`), which must not bounce back to the app.
  if (pathname === LOGIN_PATH && !request.nextUrl.searchParams.has("error")) {
    return redirectWithCookies(session.response, new URL(HOME_PATH, request.url));
  }

  if (isRoleRestricted(pathname)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();
    // Missing/inactive profiles are handled (and signed out) by requireUser() in the page.
    if (profile?.status === "active" && profile.role && !canAccessRoute(pathname, profile.role)) {
      if (isApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      return redirectWithCookies(session.response, new URL(FORBIDDEN_PATH, request.url));
    }
  }

  return session.response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, static brand assets, the favicon and
     * common static file types.
     */
    "/((?!_next/static|_next/image|brand/|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$).*)",
  ],
};
