/**
 * Hand-written Supabase database types for the `public` schema.
 *
 * Mirrors docs/ARCHITECTURE.md §3–§7 (tables, views, RPC functions, enums) in the
 * shape produced by `supabase gen types typescript`, so it can be passed to
 * `createClient<Database>()` and gives typed `.from()`, `.rpc()` and row results.
 *
 * Conventions:
 * - `date` columns are `YYYY-MM-DD` strings; `timestamptz` columns are ISO strings.
 * - `numeric` columns are typed as `number` (PostgREST serialises them as JSON numbers).
 * - RPC arguments without a SQL default are required (PostgREST resolves functions by
 *   their named arguments) but accept `null` where the function tolerates it.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export type AppRole = "owner" | "admin" | "site_manager";
export type UserStatus = "active" | "inactive";
export type ProjectStatus =
  | "planning"
  | "design"
  | "approval"
  | "procurement"
  | "execution"
  | "finishing"
  | "handover_pending"
  | "completed"
  | "on_hold"
  | "delayed"
  | "cancelled";
export type PriorityLevel = "low" | "medium" | "high" | "urgent";
export type MaterialRequestStatus =
  | "requested"
  | "pending_review"
  | "approved"
  | "rejected"
  | "ordered"
  | "partially_delivered"
  | "delivered"
  | "cancelled";
export type MilestoneStatus = "not_started" | "in_progress" | "completed" | "skipped";
export type MemberRole = "site_manager" | "admin";
export type DocumentCategory =
  | "photos"
  | "drawings"
  | "material_documents"
  | "site_reports"
  | "other";
export type PaymentMode = "cash" | "card" | "upi" | "bank_transfer" | "cheque" | "other";

/** Derived (non-enum) text states exposed by views. */
export type MemberStatus = "active" | "removed";
export type DeadlineState =
  | "completed"
  | "cancelled"
  | "no_date"
  | "overdue"
  | "due_today"
  | "due_tomorrow"
  | "due_7"
  | "due_14"
  | "due_30"
  | "on_track";
export type RequiredState =
  | "closed"
  | "overdue"
  | "due_today"
  | "due_tomorrow"
  | "due_soon"
  | "upcoming";

/* -------------------------------------------------------------------------- */
/* Table rows                                                                 */
/* -------------------------------------------------------------------------- */

type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: AppRole | null;
  employee_id: string | null;
  status: UserStatus;
  joining_date: string | null;
  avatar_url: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

type CompanySettingsRow = {
  id: number;
  company_name: string;
  logo_url: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  updated_at: string;
  updated_by: string | null;
};

type MaterialCategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

type ClientRow = {
  id: string;
  client_code: string;
  name: string;
  email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

type ProjectRow = {
  id: string;
  project_code: string;
  client_id: string;
  name: string;
  project_type: string | null;
  site_address: string | null;
  city: string | null;
  start_date: string | null;
  expected_completion_date: string | null;
  handover_date: string | null;
  actual_handover_date: string | null;
  status: ProjectStatus;
  progress_percentage: number;
  priority: PriorityLevel;
  current_milestone: string | null;
  notes: string | null;
  last_update_at: string | null;
  last_updated_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  /** Scope of work keys (WORK_SCOPES); empty = not specified. */
  work_scope: string[];
};

type ProjectFinancialsRow = {
  project_id: string;
  project_cost: number;
  advance_received: number | null;
  notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

type ProjectPaymentRow = {
  id: string;
  project_id: string;
  amount: number;
  /** `YYYY-MM-DD`. */
  paid_on: string;
  mode: PaymentMode;
  /** Shown to the client on the shared statement (UPI / transaction ID, cheque number). */
  reference: string | null;
  /** Internal only; never shown on the shared statement. */
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
};

/** Owner-only: the secret token behind /statement/<token>. */
type ProjectPaymentLinkRow = {
  project_id: string;
  token: string;
  created_at: string;
  created_by: string | null;
};

type ProjectMemberRow = {
  id: string;
  project_id: string;
  user_id: string;
  member_role: MemberRole;
  can_view_financials: boolean;
  status: MemberStatus;
  assigned_at: string;
  assigned_by: string | null;
  removed_at: string | null;
  removed_by: string | null;
};

type ProjectMilestoneRow = {
  id: string;
  project_id: string;
  name: string;
  start_date: string | null;
  target_date: string | null;
  completed_date: string | null;
  status: MilestoneStatus;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ProjectUpdateRow = {
  id: string;
  project_id: string;
  updated_by: string;
  status: ProjectStatus;
  previous_status: ProjectStatus | null;
  progress_percentage: number;
  previous_progress: number | null;
  update_date: string;
  milestone: string | null;
  expected_completion_date: string | null;
  issues: string | null;
  notes: string | null;
  next_action: string | null;
  created_at: string;
};

type ProjectDocumentRow = {
  id: string;
  project_id: string;
  category: DocumentCategory;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  archived_at: string | null;
};

type MaterialRow = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type MaterialRequestRow = {
  id: string;
  request_code: string;
  project_id: string;
  client_id: string | null;
  requested_by: string;
  assigned_admin: string | null;
  title: string;
  required_date: string;
  priority: PriorityLevel;
  status: MaterialRequestStatus;
  estimated_cost: number | null;
  approved_cost: number | null;
  actual_cost: number | null;
  requested_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  ordered_at: string | null;
  expected_delivery_date: string | null;
  delivery_date: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  /**
   * Like-for-like variance basis (trigger-maintained from items): estimated / actual
   * totals over the items that carry an actual cost. Not selectable by API users.
   */
  variance_estimated_cost: number | null;
  variance_actual_cost: number | null;
  assigned_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MaterialRequestItemRow = {
  id: string;
  request_id: string;
  material_id: string | null;
  material_name: string;
  category: string | null;
  quantity: number;
  unit: string;
  estimated_unit_cost: number | null;
  approved_unit_cost: number | null;
  actual_unit_cost: number | null;
  delivered_quantity: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type MaterialDeliveryRow = {
  id: string;
  request_id: string;
  item_id: string;
  delivered_quantity: number;
  delivery_date: string;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
};

type MaterialRequestCommentRow = {
  id: string;
  request_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  link: string | null;
  dedupe_key: string | null;
  read_at: string | null;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  user_id: string | null;
  actor_name: string | null;
  role: AppRole | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  project_id: string | null;
  summary: string | null;
  old_data: Json | null;
  new_data: Json | null;
  metadata: Json | null;
  created_at: string;
};

/* -------------------------------------------------------------------------- */
/* View rows                                                                  */
/* -------------------------------------------------------------------------- */

type ProjectDirectoryViewRow = ProjectRow & {
  client_name: string;
  client_code: string;
  site_manager_id: string | null;
  site_manager_name: string | null;
  site_manager_ids: string[];
  deadline_date: string | null;
  days_remaining: number | null;
  is_overdue: boolean;
  deadline_state: DeadlineState;
  open_material_requests: number;
  total_material_requests: number;
  /** coalesce(handover_date, expected_completion_date) — the "upcoming handovers" date. */
  handover_or_deadline: string | null;
};

type ProjectFinancialSummaryViewRow = {
  project_id: string;
  project_code: string;
  project_name: string;
  client_id: string;
  client_name: string;
  status: ProjectStatus;
  archived_at: string | null;
  project_cost: number;
  /** Amount received: the sum of project_payments (0009). */
  advance_received: number | null;
  material_estimated_cost: number;
  material_approved_cost: number;
  material_actual_cost: number;
  /** Like-for-like: actual − estimate over the items that have an actual cost. */
  material_variance: number;
  material_variance_estimated_cost: number;
  material_variance_actual_cost: number;
  payment_count: number;
  last_payment_on: string | null;
};

type ClientDirectoryViewRow = ClientRow & {
  project_count: number;
  active_project_count: number;
  latest_project_id: string | null;
  latest_project_name: string | null;
  latest_project_status: ProjectStatus | null;
  latest_progress: number | null;
  latest_start_date: string | null;
  latest_handover_date: string | null;
  latest_days_remaining: number | null;
  site_manager_name: string | null;
};

/** approved_cost / actual_cost / cost_variance are null unless the caller may see cost details. */
type MaterialRequestDirectoryViewRow = Omit<MaterialRequestRow, "variance_estimated_cost" | "variance_actual_cost"> & {
  project_code: string;
  project_name: string;
  client_name: string | null;
  requested_by_name: string | null;
  assigned_admin_name: string | null;
  item_count: number;
  items_summary: string | null;
  days_until_required: number | null;
  required_state: RequiredState;
  /** Like-for-like: actual − estimate over the items that have an actual cost. */
  cost_variance: number | null;
};

type ProjectMaterialSummaryViewRow = {
  project_id: string;
  total_requests: number;
  pending_requests: number;
  approved_requests: number;
  ordered_requests: number;
  delivered_requests: number;
  pending_material_cost: number;
  approved_material_cost: number;
  actual_material_cost: number;
};

type TeamDirectoryViewRow = {
  id: string;
  full_name: string;
  role: AppRole | null;
  employee_id: string | null;
  status: UserStatus;
  avatar_url: string | null;
};

/** `activity_feed` view (0006): audit rows without old/new data, plus project code/name from metadata. */
type ActivityFeedViewRow = Omit<AuditLogRow, "old_data" | "new_data"> & {
  project_code: string | null;
  project_name: string | null;
};

/* -------------------------------------------------------------------------- */
/* RPC payloads                                                               */
/* -------------------------------------------------------------------------- */

/** Item payload for `create_material_request` / `update_material_request_draft`. */
export type MaterialRequestItemInput = {
  material_id?: string | null;
  material_name: string;
  category?: string | null;
  quantity: number;
  unit: string;
  estimated_unit_cost?: number | null;
  notes?: string | null;
};

/** Item payload for `update_material_request_costs`. */
export type MaterialRequestCostInput = {
  item_id: string;
  estimated_unit_cost?: number | null;
  approved_unit_cost?: number | null;
  actual_unit_cost?: number | null;
};

/** Item payload for `record_material_delivery`. */
export type MaterialDeliveryInput = {
  item_id: string;
  delivered_quantity: number;
};

export type GlobalSearchEntityType =
  | "client"
  | "project"
  | "profile"
  | "material_request"
  | "material"
  | (string & {});

export type GlobalSearchResult = {
  entity_type: GlobalSearchEntityType;
  entity_id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

/** get_payment_statement() result (0009). Amounts are JSON numbers. */
export type PaymentStatement = {
  company: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    logo_url: string | null;
  } | null;
  project: {
    code: string;
    name: string;
    city: string | null;
    status: ProjectStatus;
    client_name: string;
  };
  totals: { project_cost: number; received: number; balance: number };
  by_mode: Array<{ mode: PaymentMode; amount: number; count: number }>;
  payments: Array<{ paid_on: string; mode: PaymentMode; amount: number; reference: string | null }>;
  generated_at: string;
};

export type OwnerDashboardStats = {
  total_clients: number;
  total_projects: number;
  ongoing_projects: number;
  completed_projects: number;
  on_hold_projects: number;
  delayed_projects: number;
  upcoming_handovers: number;
  total_project_value: number;
  material_estimated_cost: number;
  material_approved_cost: number;
  material_actual_cost: number;
  /** Like-for-like: actual − estimate over the items that have an actual cost. */
  material_variance: number;
  material_variance_estimated_cost: number;
  material_variance_actual_cost: number;
  pending_material_requests: number;
  overdue_material_requests: number;
  status_breakdown: { status: ProjectStatus; count: number }[];
  monthly_material_cost: { month: string; estimated: number; actual: number }[];
};

export type SiteManagerDashboardStats = {
  my_projects: number;
  active_projects: number;
  near_deadline: number;
  overdue_projects: number;
  pending_material_requests: number;
  delivered_materials: number;
};

export type AdminDashboardStats = {
  new_requests: number;
  pending_requests: number;
  approved: number;
  ordered: number;
  partially_delivered: number;
  completed: number;
  overdue_requests: number;
  unassigned: number;
};

export type SiteManagerPerformanceRow = {
  user_id: string;
  full_name: string;
  employee_id: string | null;
  status: UserStatus;
  assigned_projects: number;
  ongoing_projects: number;
  completed_projects: number;
  delayed_projects: number;
  on_time_completed: number;
  /** null when the site manager has no completed projects */
  on_time_rate: number | null;
  avg_progress: number | null;
  material_requests_created: number;
  avg_request_completion_days: number | null;
  last_update_at: string | null;
  /** Progress updates submitted by this site manager. */
  project_updates_count: number;
};

export type AdminPerformanceRow = {
  user_id: string;
  full_name: string;
  employee_id: string | null;
  status: UserStatus;
  requests_assigned: number;
  pending: number;
  processing: number;
  completed: number;
  rejected: number;
  overdue: number;
  completion_rate: number | null;
  avg_response_hours: number | null;
  avg_completion_days: number | null;
  total_value_managed: number | null;
};

/* -------------------------------------------------------------------------- */
/* Helpers to build Insert / Update shapes                                    */
/* -------------------------------------------------------------------------- */

type Simplify<T> = { [K in keyof T]: T[K] } & {};
/** Insert shape: `Required` keys stay required, everything else becomes optional. */
type InsertOf<Row, RequiredKeys extends keyof Row> = Simplify<
  Pick<Row, RequiredKeys> & Partial<Omit<Row, RequiredKeys>>
>;
type UpdateOf<Row> = Simplify<Partial<Row>>;

type TableDef<Row, RequiredKeys extends keyof Row, Relationships extends Relationship[] = []> = {
  Row: Row;
  Insert: InsertOf<Row, RequiredKeys>;
  Update: UpdateOf<Row>;
  Relationships: Relationships;
};

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Rel<
  Name extends string,
  Column extends string,
  Target extends string,
  OneToOne extends boolean = false,
> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: OneToOne;
  referencedRelation: Target;
  referencedColumns: ["id"];
};

/* -------------------------------------------------------------------------- */
/* Database                                                                   */
/* -------------------------------------------------------------------------- */

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: TableDef<ProfileRow, "id" | "full_name" | "email">;
      company_settings: TableDef<CompanySettingsRow, never>;
      material_categories: TableDef<MaterialCategoryRow, "name">;
      clients: TableDef<
        ClientRow,
        "name",
        [Rel<"clients_created_by_fkey", "created_by", "profiles">]
      >;
      projects: TableDef<
        ProjectRow,
        "client_id" | "name",
        [
          Rel<"projects_client_id_fkey", "client_id", "clients">,
          Rel<"projects_created_by_fkey", "created_by", "profiles">,
          Rel<"projects_last_updated_by_fkey", "last_updated_by", "profiles">,
        ]
      >;
      project_financials: TableDef<
        ProjectFinancialsRow,
        "project_id",
        [Rel<"project_financials_project_id_fkey", "project_id", "projects", true>]
      >;
      project_payments: TableDef<
        ProjectPaymentRow,
        "project_id" | "amount" | "mode",
        [Rel<"project_payments_project_id_fkey", "project_id", "projects">]
      >;
      project_payment_links: TableDef<
        ProjectPaymentLinkRow,
        "project_id",
        [Rel<"project_payment_links_project_id_fkey", "project_id", "projects", true>]
      >;
      project_members: TableDef<
        ProjectMemberRow,
        "project_id" | "user_id" | "member_role",
        [
          Rel<"project_members_project_id_fkey", "project_id", "projects">,
          Rel<"project_members_user_id_fkey", "user_id", "profiles">,
        ]
      >;
      project_milestones: TableDef<
        ProjectMilestoneRow,
        "project_id" | "name" | "sort_order",
        [Rel<"project_milestones_project_id_fkey", "project_id", "projects">]
      >;
      project_updates: TableDef<
        ProjectUpdateRow,
        "project_id" | "updated_by" | "status" | "progress_percentage" | "update_date",
        [
          Rel<"project_updates_project_id_fkey", "project_id", "projects">,
          Rel<"project_updates_updated_by_fkey", "updated_by", "profiles">,
        ]
      >;
      project_documents: TableDef<
        ProjectDocumentRow,
        "project_id" | "file_name" | "storage_path",
        [
          Rel<"project_documents_project_id_fkey", "project_id", "projects">,
          Rel<"project_documents_uploaded_by_fkey", "uploaded_by", "profiles">,
        ]
      >;
      materials: TableDef<MaterialRow, "name" | "unit">;
      material_requests: TableDef<
        MaterialRequestRow,
        "project_id" | "requested_by" | "title" | "required_date",
        [
          Rel<"material_requests_project_id_fkey", "project_id", "projects">,
          Rel<"material_requests_client_id_fkey", "client_id", "clients">,
          Rel<"material_requests_requested_by_fkey", "requested_by", "profiles">,
          Rel<"material_requests_assigned_admin_fkey", "assigned_admin", "profiles">,
        ]
      >;
      material_request_items: TableDef<
        MaterialRequestItemRow,
        "request_id" | "material_name" | "quantity" | "unit",
        [
          Rel<"material_request_items_request_id_fkey", "request_id", "material_requests">,
          Rel<"material_request_items_material_id_fkey", "material_id", "materials">,
        ]
      >;
      material_deliveries: TableDef<
        MaterialDeliveryRow,
        "request_id" | "item_id" | "delivered_quantity" | "delivery_date",
        [
          Rel<"material_deliveries_request_id_fkey", "request_id", "material_requests">,
          Rel<"material_deliveries_item_id_fkey", "item_id", "material_request_items">,
          Rel<"material_deliveries_recorded_by_fkey", "recorded_by", "profiles">,
        ]
      >;
      material_request_comments: TableDef<
        MaterialRequestCommentRow,
        "request_id" | "author_id" | "body",
        [
          Rel<"material_request_comments_request_id_fkey", "request_id", "material_requests">,
          Rel<"material_request_comments_author_id_fkey", "author_id", "profiles">,
        ]
      >;
      notifications: TableDef<
        NotificationRow,
        "user_id" | "title",
        [Rel<"notifications_user_id_fkey", "user_id", "profiles">]
      >;
      audit_logs: TableDef<
        AuditLogRow,
        "action" | "entity_type",
        [Rel<"audit_logs_user_id_fkey", "user_id", "profiles">]
      >;
    };
    Views: {
      project_directory: { Row: ProjectDirectoryViewRow; Relationships: [] };
      project_financial_summary: { Row: ProjectFinancialSummaryViewRow; Relationships: [] };
      client_directory: { Row: ClientDirectoryViewRow; Relationships: [] };
      material_request_directory: { Row: MaterialRequestDirectoryViewRow; Relationships: [] };
      /** Items with approved/actual unit costs masked unless the caller may see cost details. */
      material_request_item_directory: { Row: MaterialRequestItemRow; Relationships: [] };
      project_material_summary: { Row: ProjectMaterialSummaryViewRow; Relationships: [] };
      team_directory: { Row: TeamDirectoryViewRow; Relationships: [] };
      activity_feed: { Row: ActivityFeedViewRow; Relationships: [] };
    };
    Functions: {
      app_today: { Args: Record<PropertyKey, never>; Returns: string };
      current_app_role: { Args: Record<PropertyKey, never>; Returns: AppRole | null };
      is_owner: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_site_manager: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_project_member: { Args: { p: string; r?: MemberRole | null }; Returns: boolean };
      can_access_project: { Args: { p: string }; Returns: boolean };
      can_view_project_financials: { Args: { p: string }; Returns: boolean };
      can_access_client: { Args: { c: string }; Returns: boolean };
      can_access_material_request: { Args: { r: string }; Returns: boolean };
      create_material_request: {
        Args: {
          p_project_id: string;
          p_title: string;
          p_required_date: string;
          p_priority: PriorityLevel;
          p_notes: string | null;
          p_items: MaterialRequestItemInput[];
          p_allow_duplicate?: boolean;
        };
        Returns: string;
      };
      update_material_request_draft: {
        Args: {
          p_request_id: string;
          p_title: string;
          p_required_date: string;
          p_priority: PriorityLevel;
          p_notes: string | null;
          p_items: MaterialRequestItemInput[];
        };
        Returns: undefined;
      };
      update_material_request_status: {
        Args: {
          p_request_id: string;
          p_status: MaterialRequestStatus;
          p_note?: string | null;
          p_expected_delivery_date?: string | null;
        };
        Returns: undefined;
      };
      update_material_request_delivery_date: {
        Args: {
          p_request_id: string;
          p_expected_delivery_date: string | null;
          p_note?: string | null;
        };
        Returns: undefined;
      };
      update_material_request_costs: {
        Args: { p_request_id: string; p_items: MaterialRequestCostInput[] };
        Returns: undefined;
      };
      record_material_delivery: {
        Args: {
          p_request_id: string;
          p_delivery_date: string;
          p_items: MaterialDeliveryInput[];
          p_notes?: string | null;
        };
        Returns: undefined;
      };
      assign_material_request: {
        Args: { p_request_id: string; p_admin_id: string | null };
        Returns: undefined;
      };
      add_material_request_comment: {
        Args: { p_request_id: string; p_body: string };
        Returns: string;
      };
      submit_project_update: {
        Args: {
          p_project_id: string;
          p_status: ProjectStatus;
          p_progress: number;
          p_update_date: string;
          p_milestone: string | null;
          p_expected_completion_date: string | null;
          p_issues: string | null;
          p_notes: string | null;
          p_next_action: string | null;
        };
        Returns: string;
      };
      update_project_milestone: {
        Args: {
          p_milestone_id: string;
          p_status: MilestoneStatus;
          p_start_date: string | null;
          p_target_date: string | null;
          p_completed_date: string | null;
          p_notes: string | null;
        };
        Returns: undefined;
      };
      assign_project_member: {
        Args: {
          p_project_id: string;
          p_user_id: string;
          p_member_role: MemberRole;
          p_can_view_financials?: boolean;
          p_replace_existing?: boolean;
        };
        Returns: string;
      };
      remove_project_member: {
        Args: { p_project_id: string; p_user_id: string };
        Returns: undefined;
      };
      set_user_status: {
        Args: { p_user_id: string; p_status: UserStatus };
        Returns: undefined;
      };
      generate_deadline_notifications: { Args: Record<PropertyKey, never>; Returns: number };
      mark_all_notifications_read: { Args: Record<PropertyKey, never>; Returns: undefined };
      global_search: {
        Args: { p_query: string; p_limit?: number };
        Returns: GlobalSearchResult[];
      };
      get_owner_dashboard: { Args: Record<PropertyKey, never>; Returns: OwnerDashboardStats };
      get_site_manager_performance: {
        Args: Record<PropertyKey, never>;
        Returns: SiteManagerPerformanceRow[];
      };
      get_admin_performance: {
        Args: Record<PropertyKey, never>;
        Returns: AdminPerformanceRow[];
      };
      get_site_manager_dashboard: {
        Args: Record<PropertyKey, never>;
        Returns: SiteManagerDashboardStats;
      };
      get_admin_dashboard: { Args: Record<PropertyKey, never>; Returns: AdminDashboardStats };
      /** Public (anon) share-link statement; null for an unknown or disabled token. */
      get_payment_statement: { Args: { p_token: string }; Returns: PaymentStatement | null };
    };
    Enums: {
      app_role: AppRole;
      user_status: UserStatus;
      project_status: ProjectStatus;
      priority_level: PriorityLevel;
      material_request_status: MaterialRequestStatus;
      milestone_status: MilestoneStatus;
      member_role: MemberRole;
      document_category: DocumentCategory;
      payment_mode: PaymentMode;
    };
    CompositeTypes: Record<PropertyKey, never>;
  };
};

/* -------------------------------------------------------------------------- */
/* Generic accessors (same names as supabase-generated helpers)               */
/* -------------------------------------------------------------------------- */

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
export type RpcName = keyof PublicSchema["Functions"];
export type RpcArgs<T extends RpcName> = PublicSchema["Functions"][T]["Args"];
export type RpcReturns<T extends RpcName> = PublicSchema["Functions"][T]["Returns"];

/* -------------------------------------------------------------------------- */
/* Convenient row aliases                                                     */
/* -------------------------------------------------------------------------- */

export type Profile = Tables<"profiles">;
export type CompanySettings = Tables<"company_settings">;
export type MaterialCategory = Tables<"material_categories">;
export type Client = Tables<"clients">;
export type Project = Tables<"projects">;
export type ProjectFinancials = Tables<"project_financials">;
export type ProjectPayment = Tables<"project_payments">;
export type ProjectPaymentLink = Tables<"project_payment_links">;
export type ProjectMember = Tables<"project_members">;
export type ProjectMilestone = Tables<"project_milestones">;
export type ProjectUpdate = Tables<"project_updates">;
export type ProjectDocument = Tables<"project_documents">;
export type Material = Tables<"materials">;
export type MaterialRequest = Tables<"material_requests">;
export type MaterialRequestItem = Tables<"material_request_items">;
export type MaterialDelivery = Tables<"material_deliveries">;
export type MaterialRequestComment = Tables<"material_request_comments">;
export type Notification = Tables<"notifications">;
export type AuditLog = Tables<"audit_logs">;

export type ProjectDirectoryRow = Views<"project_directory">;
export type ProjectFinancialSummaryRow = Views<"project_financial_summary">;
export type ClientDirectoryRow = Views<"client_directory">;
export type MaterialRequestDirectoryRow = Views<"material_request_directory">;
export type ProjectMaterialSummaryRow = Views<"project_material_summary">;
export type TeamDirectoryRow = Views<"team_directory">;
export type ActivityFeedRow = Views<"activity_feed">;
