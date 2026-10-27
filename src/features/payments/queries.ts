import "server-only";
import { cache } from "react";
import { logServerError, toFriendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { PaymentStatement, ProjectPayment } from "@/types/database";

/** Owner, or a member the owner granted financial access (rpc can_view_project_financials). */
export const canViewProjectFinancials = cache(async (projectId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_view_project_financials", { p: projectId });
  if (error) {
    logServerError("payments.canView", error);
    return false;
  }
  return data === true;
});

/** Newest first. RLS returns rows only to callers allowed to see the project's financials. */
export async function listProjectPayments(projectId: string): Promise<ProjectPayment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_payments")
    .select("*")
    .eq("project_id", projectId)
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(toFriendlyError(error, "We couldn't load the payments.", "payments.list"));
  return data ?? [];
}

/** Owner only: the share token, or null when no link is active. */
export async function getPaymentLinkToken(projectId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_payment_links")
    .select("token")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    logServerError("payments.link", error);
    return null;
  }
  return data?.token ?? null;
}

/** Public statement for a share token (works signed out); null when the link is unknown or disabled. */
export const getPaymentStatement = cache(async (token: string): Promise<PaymentStatement | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_payment_statement", { p_token: token });
  if (error) throw new Error(toFriendlyError(error, "We couldn't load this statement.", "payments.statement"));
  return data ?? null;
});
