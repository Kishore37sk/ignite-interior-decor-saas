"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { fail, failFromError, ok, validationFailure, type ActionResult } from "@/lib/action-result";
import { todayIST } from "@/lib/dates";
import { friendlyMessage, isRpcError, logServerError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import type { MaterialRequestCostInput, MaterialRequestItemInput } from "@/types/database";
import { REQUEST_CODE_PATTERN } from "./constants";
import {
  assignSchema,
  catalogActiveSchema,
  catalogItemSchema,
  commentSchema,
  costsSchema,
  createRequestSchema,
  deliveryDateSchema,
  deliverySchema,
  statusChangeSchema,
  updateRequestDraftSchema,
  type CatalogItemInput,
  type CostsInput,
  type CreateRequestInput,
  type DeliveryDateInput,
  type DeliveryInput,
  type StatusChangeInput,
  type UpdateRequestDraftInput,
} from "./schemas";

function revalidateRequests(requestId?: string) {
  revalidatePath("/material-requests");
  if (requestId) revalidatePath(`/material-requests/${requestId}`);
  revalidatePath("/materials");
  revalidatePath("/dashboard");
  revalidatePath("/projects/[id]", "page");
}

type ItemValues = {
  material_id: string | null;
  material_name: string;
  category: string | null;
  quantity: number;
  unit: string;
  estimated_unit_cost: number | null;
  notes: string | null;
};

function toRpcItems(items: readonly ItemValues[]): MaterialRequestItemInput[] {
  return items.map((item) => ({
    material_id: item.material_id,
    material_name: item.material_name,
    category: item.category,
    quantity: item.quantity,
    unit: item.unit,
    estimated_unit_cost: item.estimated_unit_cost,
    notes: item.notes,
  }));
}

/* -------------------------------------------------------------------------- */
/* Create / edit                                                              */
/* -------------------------------------------------------------------------- */

export type CreateRequestResult =
  | { kind: "created"; id: string }
  | { kind: "duplicate"; message: string; existing: { id: string; code: string } | null };

export async function createMaterialRequestAction(
  input: CreateRequestInput,
): Promise<ActionResult<CreateRequestResult>> {
  await requireRole("owner", "site_manager");
  const parsed = createRequestSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_material_request", {
    p_project_id: values.project_id,
    p_title: values.title,
    p_required_date: values.required_date,
    p_priority: values.priority,
    p_notes: values.notes,
    p_items: toRpcItems(values.items),
    p_allow_duplicate: values.allow_duplicate,
  });

  if (error) {
    if (isRpcError(error, "DUPLICATE_REQUEST")) {
      const code = REQUEST_CODE_PATTERN.exec(error.message)?.[0] ?? null;
      let existing: { id: string; code: string } | null = null;
      if (code) {
        const { data: match, error: lookupError } = await supabase
          .from("material_request_directory")
          .select("id, request_code")
          .eq("request_code", code)
          .maybeSingle();
        if (lookupError) logServerError("materials.create.duplicateLookup", lookupError);
        if (match) existing = { id: match.id, code: match.request_code };
      }
      return ok({ kind: "duplicate", message: friendlyMessage(error), existing });
    }
    return failFromError(error, "We couldn't create the material request.", "materials.create");
  }
  if (!data) return fail("We couldn't create the material request.");

  revalidateRequests(data);
  return ok({ kind: "created", id: data }, "Material request submitted.");
}

export async function updateMaterialRequestDraftAction(
  input: UpdateRequestDraftInput,
): Promise<ActionResult<{ id: string }>> {
  await requireRole("owner", "site_manager");
  const parsed = updateRequestDraftSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_material_request_draft", {
    p_request_id: values.request_id,
    p_title: values.title,
    p_required_date: values.required_date,
    p_priority: values.priority,
    p_notes: values.notes,
    p_items: toRpcItems(values.items),
  });
  if (error) return failFromError(error, "We couldn't save your changes.", "materials.updateDraft");

  revalidateRequests(values.request_id);
  return ok({ id: values.request_id }, "Request updated.");
}

/* -------------------------------------------------------------------------- */
/* Workflow                                                                   */
/* -------------------------------------------------------------------------- */

const STATUS_MESSAGES: Record<StatusChangeInput["status"], string> = {
  pending_review: "Marked as pending review.",
  approved: "Request approved.",
  rejected: "Request rejected.",
  ordered: "Marked as ordered.",
  cancelled: "Request cancelled.",
};

export async function changeRequestStatusAction(input: StatusChangeInput): Promise<ActionResult> {
  const user = await requireRole("owner", "admin", "site_manager");
  const parsed = statusChangeSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;
  if (user.role === "site_manager" && values.status !== "cancelled") {
    return fail("Site managers can only cancel their own requests.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_material_request_status", {
    p_request_id: values.request_id,
    p_status: values.status,
    p_note: values.note,
    p_expected_delivery_date: values.status === "ordered" ? values.expected_delivery_date : null,
  });
  if (error) return failFromError(error, "We couldn't update the request status.", "materials.status");

  revalidateRequests(values.request_id);
  return { ok: true, data: undefined, message: STATUS_MESSAGES[values.status] };
}

export async function updateRequestCostsAction(input: CostsInput): Promise<ActionResult> {
  await requireRole("owner", "admin");
  const parsed = costsSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error, "Please check the highlighted costs.");
  const values = parsed.data;

  // Only keys the user changed are sent; absent keys keep the stored value.
  const COST_KEYS = ["estimated_unit_cost", "approved_unit_cost", "actual_unit_cost"] as const;
  const items = values.items
    .map((item) => {
      const entry: MaterialRequestCostInput = { item_id: item.item_id };
      for (const key of COST_KEYS) {
        if (item[key] !== undefined) entry[key] = item[key];
      }
      return entry;
    })
    .filter((entry) => Object.keys(entry).length > 1);
  if (items.length === 0) return { ok: true, data: undefined, message: "No cost changes to save." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_material_request_costs", {
    p_request_id: values.request_id,
    p_items: items,
  });
  if (error) return failFromError(error, "We couldn't save the costs.", "materials.costs");

  revalidateRequests(values.request_id);
  return { ok: true, data: undefined, message: "Costs updated." };
}

/** Moves the expected delivery date of an approved / ordered / partially delivered request. */
export async function updateDeliveryDateAction(input: DeliveryDateInput): Promise<ActionResult> {
  await requireRole("owner", "admin");
  const parsed = deliveryDateSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_material_request_delivery_date", {
    p_request_id: values.request_id,
    p_expected_delivery_date: values.expected_delivery_date,
    p_note: values.note,
  });
  if (error) return failFromError(error, "We couldn't update the expected delivery date.", "materials.deliveryDate");

  revalidateRequests(values.request_id);
  return { ok: true, data: undefined, message: "Expected delivery date updated." };
}

export async function recordDeliveryAction(input: DeliveryInput): Promise<ActionResult> {
  await requireRole("owner", "admin");
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error, "Please check the delivered quantities.");
  const values = parsed.data;
  const items = values.items
    .filter((item) => (item.delivered_quantity ?? 0) > 0)
    .map((item) => ({ item_id: item.item_id, delivered_quantity: item.delivered_quantity ?? 0 }));

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_material_delivery", {
    p_request_id: values.request_id,
    p_delivery_date: values.delivery_date,
    p_items: items,
    p_notes: values.notes,
  });
  if (error) return failFromError(error, "We couldn't record the delivery.", "materials.delivery");

  revalidateRequests(values.request_id);
  return { ok: true, data: undefined, message: "Delivery recorded." };
}

/** Records every remaining quantity as delivered today (completes the request). */
export async function markDeliveredAction(requestId: string): Promise<ActionResult> {
  await requireRole("owner", "admin");
  const id = uuid.safeParse(requestId);
  if (!id.success) return fail("Invalid request.");

  const supabase = await createClient();
  const { data: items, error: itemsError } = await supabase
    .from("material_request_items")
    .select("id, quantity, delivered_quantity")
    .eq("request_id", id.data);
  if (itemsError) return failFromError(itemsError, "We couldn't load the request items.", "materials.markDelivered.items");

  const remaining = (items ?? [])
    .map((item) => ({
      item_id: item.id,
      delivered_quantity: Math.round((Number(item.quantity) - Number(item.delivered_quantity)) * 100) / 100,
    }))
    .filter((item) => item.delivered_quantity > 0);
  if (remaining.length === 0) return fail("Every item has already been delivered.");

  const { error } = await supabase.rpc("record_material_delivery", {
    p_request_id: id.data,
    p_delivery_date: todayIST(),
    p_items: remaining,
    p_notes: "Marked as fully delivered.",
  });
  if (error) return failFromError(error, "We couldn't mark the request as delivered.", "materials.markDelivered");

  revalidateRequests(id.data);
  return { ok: true, data: undefined, message: "Marked as delivered." };
}

export async function assignRequestAction(input: { request_id: string; admin_id: string | null }): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const values = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_material_request", {
    p_request_id: values.request_id,
    // The RPC accepts null to unassign (owner only).
    p_admin_id: values.admin_id ?? null,
  });
  if (error) return failFromError(error, "We couldn't assign the request.", "materials.assign");

  revalidateRequests(values.request_id);
  return { ok: true, data: undefined, message: values.admin_id ? "Request assigned." : "Request unassigned." };
}

export async function claimRequestAction(requestId: string): Promise<ActionResult> {
  const user = await requireRole("admin");
  const id = uuid.safeParse(requestId);
  if (!id.success) return fail("Invalid request.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_material_request", { p_request_id: id.data, p_admin_id: user.id });
  if (error) return failFromError(error, "We couldn't claim this request.", "materials.claim");

  revalidateRequests(id.data);
  return { ok: true, data: undefined, message: "Request assigned to you." };
}

export async function addCommentAction(input: { request_id: string; body: string }): Promise<ActionResult<{ id: string }>> {
  await requireRole("owner", "admin", "site_manager");
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_material_request_comment", {
    p_request_id: parsed.data.request_id,
    p_body: parsed.data.body,
  });
  if (error) return failFromError(error, "We couldn't post your comment.", "materials.comment");

  revalidatePath(`/material-requests/${parsed.data.request_id}`);
  return ok({ id: data ?? "" }, "Comment added.");
}

/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

const NAME_TAKEN = "A material with this name already exists in the catalog.";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

export async function saveCatalogItemAction(input: CatalogItemInput): Promise<ActionResult<{ id: string }>> {
  await requireRole("owner", "admin");
  const parsed = catalogItemSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const { id, ...values } = parsed.data;

  const supabase = await createClient();
  const result = id
    ? await supabase.from("materials").update(values).eq("id", id).select("id").maybeSingle()
    : await supabase.from("materials").insert(values).select("id").single();

  if (result.error) {
    if (isUniqueViolation(result.error)) return fail(NAME_TAKEN, { name: [NAME_TAKEN] });
    return failFromError(result.error, "We couldn't save this material.", "materials.catalog.save");
  }
  if (!result.data) return fail("We couldn't find that material. It may have been removed.");

  revalidatePath("/materials");
  revalidatePath("/material-requests/new");
  return ok({ id: result.data.id }, id ? "Material updated." : "Material added to the catalog.");
}

export async function setCatalogItemActiveAction(input: { id: string; is_active: boolean }): Promise<ActionResult> {
  await requireRole("owner", "admin");
  const parsed = catalogActiveSchema.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("materials")
    .update({ is_active: parsed.data.is_active })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error) return failFromError(error, "We couldn't update this material.", "materials.catalog.active");
  if (!data) return fail("We couldn't find that material. It may have been removed.");

  revalidatePath("/materials");
  revalidatePath("/material-requests/new");
  return {
    ok: true,
    data: undefined,
    message: parsed.data.is_active ? "Material reactivated." : "Material deactivated. It can no longer be picked for new requests.",
  };
}
