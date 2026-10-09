"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps a request detail page fresh: any change to the request row (status, costs,
 * assignment, delivery), a new comment or a recorded delivery triggers a server
 * re-render. Realtime honours RLS.
 */
export function RequestRealtime({ requestId }: { requestId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return; // Realtime is an enhancement; the page works without it.
    }
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel(`material-request-${requestId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "material_requests", filter: `id=eq.${requestId}` }, refresh)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "material_request_comments", filter: `request_id=eq.${requestId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "material_deliveries", filter: `request_id=eq.${requestId}` },
        refresh,
      )
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [requestId, router]);

  return null;
}
