import { z } from "zod";
import {
  checkbox,
  optionalEmail,
  optionalPhone,
  optionalText,
  requiredText,
} from "@/lib/validation/common";

/** Client create/edit form (owner only). Shared by the client form and server actions. */
export const clientFormSchema = z
  .object({
    name: requiredText("Client name", 160),
    email: optionalEmail,
    phone: optionalPhone,
    alternate_phone: optionalPhone,
    address: optionalText(500, "Address"),
    city: optionalText(80, "City"),
    state: optionalText(80, "State"),
    country: optionalText(80, "Country").transform((v) => v ?? "India"),
    notes: optionalText(2000, "Notes"),
    /** Set after the owner confirms "Create anyway" on a possible duplicate. */
    allow_duplicate: checkbox,
  })
  .superRefine((value, ctx) => {
    if (value.phone && value.alternate_phone && value.phone === value.alternate_phone) {
      ctx.addIssue({
        code: "custom",
        path: ["alternate_phone"],
        message: "Alternate phone should be different from the primary phone.",
      });
    }
  });

export type ClientFormValues = z.output<typeof clientFormSchema>;

export const CLIENT_STATUS_FILTERS = ["active", "archived", "all"] as const;
export type ClientStatusFilter = (typeof CLIENT_STATUS_FILTERS)[number];

export const CLIENT_SORT_KEYS = [
  "name",
  "project",
  "status",
  "progress",
  "start_date",
  "handover_date",
  "days_remaining",
  "created_at",
] as const;
export type ClientSortKey = (typeof CLIENT_SORT_KEYS)[number];

/** UI sort key → client_directory column. */
export const CLIENT_SORT_COLUMNS: Record<ClientSortKey, string> = {
  name: "name",
  project: "latest_project_name",
  status: "latest_project_status",
  progress: "latest_progress",
  start_date: "latest_start_date",
  handover_date: "latest_handover_date",
  days_remaining: "latest_days_remaining",
  created_at: "created_at",
};
