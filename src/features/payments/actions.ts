"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { fail, failFromError, ok, validationFailure, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, uuid } from "@/lib/validation/common";
import { paymentFormSchema } from "./schemas";
import { statementPath, statementUrl } from "./statement";

function revalidatePayments(projectId: string, token?: string | null) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/clients", "layout");
  if (token) revalidatePath(statementPath(token));
}

/** 256-bit URL-safe token (43 characters). */
function newToken(): string {
  return randomBytes(32).toString("base64url");
}

async function currentToken(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string) {
  const { data } = await supabase.from("project_payment_links").select("token").eq("project_id", projectId).maybeSingle();
  return data?.token ?? null;
}

/** Record a new payment, or edit one when `payment_id` is set (owner). */
export async function savePaymentAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireRole("owner");
  const parsed = paymentFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const { payment_id: paymentId, project_id: projectId, ...values } = parsed.data;
  const supabase = await createClient();

  const query = paymentId
    ? supabase.from("project_payments").update(values).eq("id", paymentId).eq("project_id", projectId)
    : supabase.from("project_payments").insert({ project_id: projectId, ...values });
  const { data, error } = await query.select("id").maybeSingle();
  if (error) {
    return failFromError(
      error,
      paymentId ? "We couldn't update the payment." : "We couldn't record the payment.",
      "payments.save",
    );
  }
  if (!data) return fail("We couldn't find that payment. It may have been deleted.");

  revalidatePayments(projectId, await currentToken(supabase, projectId));
  return ok({ id: data.id }, paymentId ? "Payment updated." : "Payment recorded.");
}

export async function deletePaymentAction(projectId: string, paymentId: string): Promise<ActionResult> {
  await requireRole("owner");
  const project = uuid.safeParse(projectId);
  const payment = uuid.safeParse(paymentId);
  if (!project.success || !payment.success) return fail("We couldn't find that payment.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_payments")
    .delete()
    .eq("id", payment.data)
    .eq("project_id", project.data)
    .select("id")
    .maybeSingle();
  if (error) return failFromError(error, "We couldn't delete the payment.", "payments.delete");
  if (!data) return fail("We couldn't find that payment. It may have been deleted already.");
  revalidatePayments(project.data, await currentToken(supabase, project.data));
  return ok(undefined, "Payment deleted.");
}

/**
 * Create the client statement link, or replace its token (`regenerate`) so the old
 * link stops working. Returns the full URL to share.
 */
export async function createPaymentLinkAction(
  projectId: string,
  regenerate = false,
): Promise<ActionResult<{ url: string }>> {
  await requireRole("owner");
  const id = uuid.safeParse(projectId);
  if (!id.success) return fail("We couldn't find that project.");
  const supabase = await createClient();
  const previous = await currentToken(supabase, id.data);
  if (previous && !regenerate) return ok({ url: statementUrl(previous) }, "The link is ready to share.");

  const token = newToken();
  const { error } = previous
    ? await supabase.from("project_payment_links").update({ token }).eq("project_id", id.data)
    : await supabase.from("project_payment_links").insert({ project_id: id.data, token });
  if (error) return failFromError(error, "We couldn't create the link. Please try again.", "payments.link.create");

  revalidatePayments(id.data, previous);
  return ok(
    { url: statementUrl(token) },
    previous ? "New link created. The old link no longer works." : "Link created. Share it with your client.",
  );
}

/** Turn the link off; anyone opening it sees "link not available". */
export async function disablePaymentLinkAction(projectId: string): Promise<ActionResult> {
  await requireRole("owner");
  const id = uuid.safeParse(projectId);
  if (!id.success) return fail("We couldn't find that project.");
  const supabase = await createClient();
  const previous = await currentToken(supabase, id.data);
  const { error } = await supabase.from("project_payment_links").delete().eq("project_id", id.data);
  if (error) return failFromError(error, "We couldn't disable the link.", "payments.link.disable");
  revalidatePayments(id.data, previous);
  return ok(undefined, "Link disabled. Your client can no longer open it.");
}
