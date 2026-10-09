"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  fail,
  failFromError,
  ok,
  validationFailure,
  type ActionResult,
} from "@/lib/action-result";
import { logServerError } from "@/lib/errors";
import { escapeLikePattern, ilikeAnyFilter } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject, uuid } from "@/lib/validation/common";
import { clientFormSchema, type ClientFormValues } from "./schemas";

export type DuplicateClientMatch = { id: string; name: string; client_code: string; archived: boolean };

export type ClientSaveResult =
  | { status: "saved"; id: string }
  | { status: "duplicate"; matches: DuplicateClientMatch[] };

const EMAIL_TAKEN = "A client with this email already exists.";

function quoteFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

/** Last 10 digits of a normalised phone, for tolerant matching (+91 / 0 prefixes). */
function phoneKey(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-10) : null;
}

/** Existing clients sharing a phone number or email (case-insensitive). */
async function findDuplicateClients(
  supabase: Awaited<ReturnType<typeof createClient>>,
  values: ClientFormValues,
  excludeId?: string,
): Promise<DuplicateClientMatch[]> {
  const filters: string[] = [];
  for (const key of new Set([phoneKey(values.phone), phoneKey(values.alternate_phone)])) {
    if (key) filters.push(ilikeAnyFilter(["phone", "alternate_phone"], key));
  }
  if (values.email) filters.push(`email.ilike.${quoteFilterValue(escapeLikePattern(values.email))}`);
  if (filters.length === 0) return [];

  let query = supabase
    .from("clients")
    .select("id, name, client_code, archived_at")
    .or(filters.join(","))
    .limit(5);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) {
    // The unique email index is the hard guard; a failed soft check must not block saving.
    logServerError("clients.findDuplicates", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    client_code: row.client_code,
    archived: row.archived_at !== null,
  }));
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

function toClientColumns(values: ClientFormValues) {
  return {
    name: values.name,
    email: values.email,
    phone: values.phone,
    alternate_phone: values.alternate_phone,
    address: values.address,
    city: values.city,
    state: values.state,
    country: values.country,
    notes: values.notes,
  };
}

export async function createClientAction(formData: FormData): Promise<ActionResult<ClientSaveResult>> {
  await requireRole("owner");
  const parsed = clientFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  const supabase = await createClient();
  if (!values.allow_duplicate) {
    const matches = await findDuplicateClients(supabase, values);
    if (matches.length > 0) return ok<ClientSaveResult>({ status: "duplicate", matches });
  }

  const { data, error } = await supabase.from("clients").insert(toClientColumns(values)).select("id").single();
  if (error) {
    if (isUniqueViolation(error)) {
      logServerError("clients.create.duplicateEmail", error);
      return fail(EMAIL_TAKEN, { email: [EMAIL_TAKEN] });
    }
    return failFromError(error, "We couldn't create the client. Please try again.", "clients.create");
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return ok<ClientSaveResult>({ status: "saved", id: data.id }, "Client created.");
}

export async function updateClientAction(
  clientId: string,
  formData: FormData,
): Promise<ActionResult<ClientSaveResult>> {
  await requireRole("owner");
  const id = uuid.safeParse(clientId);
  if (!id.success) return fail("We couldn't find that client.");
  const parsed = clientFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  const supabase = await createClient();
  if (!values.allow_duplicate) {
    const matches = await findDuplicateClients(supabase, values, id.data);
    if (matches.length > 0) return ok<ClientSaveResult>({ status: "duplicate", matches });
  }

  const { data, error } = await supabase
    .from("clients")
    .update(toClientColumns(values))
    .eq("id", id.data)
    .select("id")
    .maybeSingle();
  if (error) {
    if (isUniqueViolation(error)) {
      logServerError("clients.update.duplicateEmail", error);
      return fail(EMAIL_TAKEN, { email: [EMAIL_TAKEN] });
    }
    return failFromError(error, "We couldn't save the client. Please try again.", "clients.update");
  }
  if (!data) return fail("We couldn't find that client. It may have been removed.");

  revalidatePath("/clients");
  revalidatePath(`/clients/${id.data}`);
  return ok<ClientSaveResult>({ status: "saved", id: data.id }, "Client updated.");
}

/** Archive (soft delete) or restore a client. Clients are never deleted. */
export async function setClientArchivedAction(
  clientId: string,
  archived: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requireRole("owner");
  const id = uuid.safeParse(clientId);
  if (!id.success) return fail("We couldn't find that client.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id.data)
    .select("id")
    .maybeSingle();
  if (error) {
    if (!archived && isUniqueViolation(error)) {
      logServerError("clients.restore.duplicateEmail", error);
      return fail("Another active client already uses this email. Change one of the emails before restoring.");
    }
    return failFromError(
      error,
      archived ? "We couldn't archive the client." : "We couldn't restore the client.",
      "clients.setArchived",
    );
  }
  if (!data) return fail("We couldn't find that client. It may have been removed.");

  revalidatePath("/clients");
  revalidatePath(`/clients/${id.data}`);
  revalidatePath("/dashboard");
  return ok({ id: data.id }, archived ? "Client archived." : "Client restored.");
}
