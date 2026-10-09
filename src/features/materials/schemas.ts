import { z } from "zod";
import { todayIST } from "@/lib/dates";
import {
  dateOnly,
  optionalDate,
  optionalMoney,
  optionalText,
  optionalUuid,
  prioritySchema,
  quantity,
  requiredText,
  uuid,
} from "@/lib/validation/common";
import { MAX_REQUEST_ITEMS } from "./constants";

/* -------------------------------------------------------------------------- */
/* Request create / edit                                                      */
/* -------------------------------------------------------------------------- */

export const requestItemSchema = z.object({
  material_id: optionalUuid,
  material_name: requiredText("Material name", 160),
  category: optionalText(80, "Category"),
  quantity,
  unit: requiredText("Unit", 32),
  estimated_unit_cost: optionalMoney,
  notes: optionalText(500, "Item notes"),
});

const requestBase = {
  title: requiredText("Title", 200),
  required_date: dateOnly,
  priority: prioritySchema,
  notes: optionalText(2000, "Notes"),
  items: z
    .array(requestItemSchema, { error: "Add at least one material item." })
    .min(1, "Add at least one material item.")
    .max(MAX_REQUEST_ITEMS, `A request can contain at most ${MAX_REQUEST_ITEMS} items.`),
};

export const createRequestSchema = z
  .object({
    project_id: uuid,
    allow_duplicate: z.boolean().optional().default(false),
    ...requestBase,
  })
  .superRefine((value, ctx) => {
    if (value.required_date < todayIST()) {
      ctx.addIssue({ code: "custom", path: ["required_date"], message: "Required date cannot be in the past." });
    }
  });

export type CreateRequestInput = z.input<typeof createRequestSchema>;

export const updateRequestDraftSchema = z.object({
  request_id: uuid,
  /** The date currently saved: an unchanged past date may be kept. */
  original_required_date: optionalDate,
  ...requestBase,
}).superRefine((value, ctx) => {
  if (value.required_date < todayIST() && value.required_date !== value.original_required_date) {
    ctx.addIssue({ code: "custom", path: ["required_date"], message: "Required date cannot be in the past." });
  }
});

export type UpdateRequestDraftInput = z.input<typeof updateRequestDraftSchema>;

/* -------------------------------------------------------------------------- */
/* Workflow                                                                   */
/* -------------------------------------------------------------------------- */

/** Status changes offered as buttons (deliveries go through recordDelivery). */
export const STATUS_ACTION_TARGETS = ["pending_review", "approved", "rejected", "ordered", "cancelled"] as const;

export const statusChangeSchema = z
  .object({
    request_id: uuid,
    status: z.enum(STATUS_ACTION_TARGETS, { error: "Choose a valid status." }),
    note: optionalText(2000, "Note"),
    expected_delivery_date: optionalDate,
  })
  .superRefine((value, ctx) => {
    if (value.status === "rejected" && !value.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Enter a reason for rejecting this request." });
    }
    if (value.expected_delivery_date && value.expected_delivery_date < todayIST()) {
      ctx.addIssue({
        code: "custom",
        path: ["expected_delivery_date"],
        message: "Expected delivery date cannot be in the past.",
      });
    }
  });

export type StatusChangeInput = z.input<typeof statusChangeSchema>;

export const deliveryDateSchema = z
  .object({
    request_id: uuid,
    expected_delivery_date: dateOnly,
    note: optionalText(2000, "Note"),
  })
  .superRefine((value, ctx) => {
    if (value.expected_delivery_date < todayIST()) {
      ctx.addIssue({
        code: "custom",
        path: ["expected_delivery_date"],
        message: "Expected delivery date cannot be in the past.",
      });
    }
  });

export type DeliveryDateInput = z.input<typeof deliveryDateSchema>;

/**
 * Cost keys are sent only when the user changed them: an absent key leaves the stored
 * value untouched (the RPC treats a present key as authoritative), so a stale dialog
 * can't wipe costs someone else saved meanwhile. `""` / null clears a cost.
 */
const changedMoney = optionalMoney.optional();

export const costsSchema = z.object({
  request_id: uuid,
  items: z
    .array(
      z.object({
        item_id: uuid,
        estimated_unit_cost: changedMoney,
        approved_unit_cost: changedMoney,
        actual_unit_cost: changedMoney,
      }),
    )
    .min(1, "Provide at least one item cost."),
});

export type CostsInput = z.input<typeof costsSchema>;

export const deliverySchema = z
  .object({
    request_id: uuid,
    delivery_date: dateOnly,
    notes: optionalText(2000, "Notes"),
    items: z.array(
      z.object({
        item_id: uuid,
        // 0 / empty = nothing delivered for this line (filtered out below).
        delivered_quantity: optionalMoney,
      }),
    ),
  })
  .superRefine((value, ctx) => {
    if (value.delivery_date > todayIST()) {
      ctx.addIssue({ code: "custom", path: ["delivery_date"], message: "Delivery date cannot be in the future." });
    }
    if (!value.items.some((item) => (item.delivered_quantity ?? 0) > 0)) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "Enter a delivered quantity for at least one item." });
    }
  });

export type DeliveryInput = z.input<typeof deliverySchema>;

export const assignSchema = z.object({
  request_id: uuid,
  admin_id: optionalUuid,
});

export const commentSchema = z.object({
  request_id: uuid,
  body: requiredText("Comment", 2000),
});

/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

export const catalogItemSchema = z.object({
  id: optionalUuid,
  name: requiredText("Name", 160),
  category: optionalText(80, "Category"),
  unit: requiredText("Unit", 32),
  description: optionalText(1000, "Description"),
  is_active: z.boolean().optional().default(true),
});

export type CatalogItemInput = z.input<typeof catalogItemSchema>;

export const catalogActiveSchema = z.object({
  id: uuid,
  is_active: z.boolean(),
});
