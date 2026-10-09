import type { MaterialRequestStatus } from "@/types/database";

/** `/material-requests?view=` values (ARCHITECTURE §9). */
export const REQUEST_VIEWS = ["open", "pending", "processing", "completed", "overdue", "unassigned", "mine"] as const;
export type RequestView = (typeof REQUEST_VIEWS)[number];

export const REQUEST_VIEW_LABELS: Record<RequestView, string> = {
  open: "Open",
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  overdue: "Overdue",
  unassigned: "Unassigned",
  mine: "Mine",
};

/** `?sort=` keys; `urgency` is the default (open requests first, then required date). */
export const REQUEST_SORT_KEYS = [
  "urgency",
  "required_date",
  "priority",
  "created_at",
  "status",
  "estimated_cost",
] as const;
export type RequestSortKey = (typeof REQUEST_SORT_KEYS)[number];

/** Tabs on /materials. */
export const MATERIALS_TABS = ["requirements", "catalog"] as const;
export type MaterialsTab = (typeof MATERIALS_TABS)[number];

/** Requirement item status filter on /materials (request-status groups). */
export const REQUIREMENT_STATUS_FILTERS = ["pending", "approved", "ordered", "delivered", "closed"] as const;
export type RequirementStatusFilter = (typeof REQUIREMENT_STATUS_FILTERS)[number];

export const REQUIREMENT_STATUS_FILTER_LABELS: Record<RequirementStatusFilter, string> = {
  pending: "Pending review",
  approved: "Approved",
  ordered: "Ordered / partially delivered",
  delivered: "Delivered",
  closed: "Rejected / cancelled",
};

export const REQUIREMENT_STATUS_GROUPS: Record<RequirementStatusFilter, readonly MaterialRequestStatus[]> = {
  pending: ["requested", "pending_review"],
  approved: ["approved"],
  ordered: ["ordered", "partially_delivered"],
  delivered: ["delivered"],
  closed: ["rejected", "cancelled"],
};

/** Catalog `?active=` filter. */
export const CATALOG_ACTIVE_FILTERS = ["active", "inactive"] as const;
export type CatalogActiveFilter = (typeof CATALOG_ACTIVE_FILTERS)[number];

/** Max item rows per request (mirrors insert_request_items). */
export const MAX_REQUEST_ITEMS = 100;

/** Pattern of the request code inside a DUPLICATE_REQUEST message ("MR-1004 already requests …"). */
export const REQUEST_CODE_PATTERN = /\bMR-\d+\b/;
