import type {
  ActivityFeedRow,
  MaterialRequestDirectoryRow,
  ProjectDirectoryRow,
} from "@/types/database";

/**
 * Result of a dashboard widget query. Widgets render their own friendly error card
 * instead of failing the whole dashboard when one query fails.
 */
export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

/** A slice of a list plus the total number of matching rows. */
export type CountedList<T> = { rows: T[]; total: number; /** Page actually returned (paged lists only). */ page?: number };

export type GanttProject = Pick<
  ProjectDirectoryRow,
  | "id"
  | "project_code"
  | "name"
  | "client_name"
  | "status"
  | "progress_percentage"
  | "start_date"
  | "expected_completion_date"
  | "handover_date"
  | "is_overdue"
  | "created_at"
>;

export type AttentionProject = Pick<
  ProjectDirectoryRow,
  "id" | "project_code" | "name" | "client_name" | "status" | "deadline_date" | "is_overdue" | "site_manager_name"
>;

export type HandoverProject = Pick<
  ProjectDirectoryRow,
  "id" | "project_code" | "name" | "client_name" | "status" | "handover_date" | "expected_completion_date" | "progress_percentage"
>;

export type AttentionRequest = Pick<
  MaterialRequestDirectoryRow,
  | "id"
  | "request_code"
  | "title"
  | "project_code"
  | "project_name"
  | "status"
  | "priority"
  | "required_date"
  | "required_state"
  | "items_summary"
>;

export type SmProject = Pick<
  ProjectDirectoryRow,
  | "id"
  | "project_code"
  | "name"
  | "client_name"
  | "city"
  | "status"
  | "progress_percentage"
  | "handover_date"
  | "deadline_date"
  | "expected_completion_date"
  | "deadline_state"
  | "current_milestone"
  | "open_material_requests"
  | "total_material_requests"
>;

export type QueueRequest = Pick<
  MaterialRequestDirectoryRow,
  | "id"
  | "request_code"
  | "title"
  | "project_id"
  | "project_code"
  | "project_name"
  | "items_summary"
  | "item_count"
  | "required_date"
  | "priority"
  | "status"
  | "requested_by_name"
  | "assigned_admin"
  | "assigned_admin_name"
> & {
  /** First requested line (quantity + unit) for the Quantity column; null when not loaded. */
  firstItem: { quantity: number; unit: string } | null;
};

export type ActivityRow = Pick<
  ActivityFeedRow,
  "id" | "user_id" | "actor_name" | "entity_type" | "entity_id" | "project_id" | "summary" | "metadata" | "created_at"
>;
