import { NextResponse, type NextRequest } from "next/server";
import { SEARCH_MAX_LENGTH, SEARCH_MIN_LENGTH, SEARCH_RESULT_LIMIT } from "@/lib/constants";
import { friendlyMessage, logServerError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { GlobalSearchResult } from "@/types/database";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/**
 * GET /api/search?q=… — global search across what the caller may see
 * (access is enforced inside the `global_search` RPC).
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_LENGTH);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: NO_STORE });
  }

  if (q.length < SEARCH_MIN_LENGTH) {
    return NextResponse.json({ query: q, results: [] satisfies GlobalSearchResult[] }, { headers: NO_STORE });
  }

  const { data, error } = await supabase.rpc("global_search", {
    p_query: q,
    p_limit: SEARCH_RESULT_LIMIT,
  });

  if (error) {
    logServerError("api.search", error);
    return NextResponse.json(
      { error: friendlyMessage(error, "Search is unavailable right now. Please try again.") },
      { status: 500, headers: NO_STORE },
    );
  }

  // Only same-origin app paths are returned to the client.
  const results: GlobalSearchResult[] = (data ?? []).filter(
    (row) => typeof row.href === "string" && row.href.startsWith("/") && !row.href.startsWith("//"),
  );
  return NextResponse.json({ query: q, results }, { headers: NO_STORE });
}
