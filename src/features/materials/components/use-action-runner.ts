"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

export const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";

export type RunOutcome<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Runs a server action, shows a sonner toast for the outcome and refreshes the route on
 * success. The returned shape also satisfies `ConfirmDialog`'s `onConfirm` contract.
 */
export function useActionRunner() {
  const router = useRouter();
  return useCallback(
    async <T,>(action: () => Promise<ActionResult<T>>, successFallback = "Saved."): Promise<RunOutcome<T>> => {
      let result: ActionResult<T>;
      try {
        result = await action();
      } catch {
        result = { ok: false, error: NETWORK_ERROR };
      }
      if (!result.ok) {
        toast.error(result.error);
        return { ok: false, error: result.error, fieldErrors: result.fieldErrors };
      }
      toast.success(result.message ?? successFallback);
      router.refresh();
      return { ok: true, data: result.data };
    },
    [router],
  );
}
