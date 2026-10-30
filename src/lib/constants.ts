import type {
  AppRole,
  DeadlineState,
  DocumentCategory,
  MaterialRequestStatus,
  MemberRole,
  MilestoneStatus,
  PaymentMode,
  PriorityLevel,
  ProjectStatus,
  RequiredState,
  UserStatus,
} from "@/types/database";

/* -------------------------------------------------------------------------- */
/* Brand & locale                                                             */
/* -------------------------------------------------------------------------- */

export const BRAND = {
  name: "Ignite Interior Decor",
  tagline: "Project Management Portal",
  logo: "/brand/logo.png",
} as const;

/** Footer credit on every page. */
export const DEVELOPER = {
  name: "Kishore Kumar",
  url: "https://kishore37sk.github.io/personal_website/",
} as const;

export const APP_TIMEZONE = "Asia/Kolkata";
export const APP_LOCALE = "en-IN";
export const APP_CURRENCY = "INR";

/** Visual tone used by badges, pills and indicators. */
export type Tone = "success" | "warning" | "danger" | "primary" | "muted";

/* -------------------------------------------------------------------------- */
/* Enum values (mirrors Postgres enums, ARCHITECTURE §3)                       */
/* -------------------------------------------------------------------------- */

export const APP_ROLES = ["owner", "admin", "site_manager"] as const satisfies readonly AppRole[];
export const USER_STATUSES = ["active", "inactive"] as const satisfies readonly UserStatus[];
export const PROJECT_STATUSES = [
  "planning",
  "design",
  "approval",
  "procurement",
  "execution",
  "finishing",
  "handover_pending",
  "completed",
  "on_hold",
  "delayed",
  "cancelled",
] as const satisfies readonly ProjectStatus[];
export const PRIORITY_LEVELS = [
  "low",
  "medium",
  "high",
  "urgent",
] as const satisfies readonly PriorityLevel[];
export const MATERIAL_REQUEST_STATUSES = [
  "requested",
  "pending_review",
  "approved",
  "rejected",
  "ordered",
  "partially_delivered",
  "delivered",
  "cancelled",
] as const satisfies readonly MaterialRequestStatus[];
export const MILESTONE_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "skipped",
] as const satisfies readonly MilestoneStatus[];
export const MEMBER_ROLES = ["site_manager", "admin"] as const satisfies readonly MemberRole[];
export const DOCUMENT_CATEGORIES = [
  "photos",
  "drawings",
  "material_documents",
  "site_reports",
  "other",
] as const satisfies readonly DocumentCategory[];
export const PAYMENT_MODES = [
  "upi",
  "cash",
  "card",
  "bank_transfer",
  "cheque",
  "other",
] as const satisfies readonly PaymentMode[];

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

export const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  admin: "Admin",
  site_manager: "Site Manager",
};

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "Planning",
  design: "Design",
  approval: "Approval",
  procurement: "Procurement",
  execution: "Execution",
  finishing: "Finishing",
  handover_pending: "Handover Pending",
  completed: "Completed",
  on_hold: "On Hold",
  delayed: "Delayed",
  cancelled: "Cancelled",
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const MATERIAL_REQUEST_STATUS_LABELS: Record<MaterialRequestStatus, string> = {
  requested: "Requested",
  pending_review: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
  ordered: "Ordered",
  partially_delivered: "Partially Delivered",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  completed: "Completed",
  skipped: "Skipped",
};

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  site_manager: "Site Manager",
  admin: "Admin",
};

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  photos: "Photos",
  drawings: "Drawings",
  material_documents: "Material Documents",
  site_reports: "Site Reports",
  other: "Other",
};

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  upi: "UPI",
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  other: "Other",
};

export const DEADLINE_STATE_LABELS: Record<DeadlineState, string> = {
  completed: "Completed",
  cancelled: "Cancelled",
  no_date: "No deadline",
  overdue: "Overdue",
  due_today: "Due today",
  due_tomorrow: "Due tomorrow",
  due_7: "Due within 7 days",
  due_14: "Due within 14 days",
  due_30: "Due within 30 days",
  on_track: "On track",
};

export const REQUIRED_STATE_LABELS: Record<RequiredState, string> = {
  closed: "Closed",
  overdue: "Overdue",
  due_today: "Due today",
  due_tomorrow: "Due tomorrow",
  due_soon: "Due this week",
  upcoming: "Upcoming",
};

/* -------------------------------------------------------------------------- */
/* Tones (ARCHITECTURE §3 "Status tones")                                     */
/* -------------------------------------------------------------------------- */

export const PROJECT_STATUS_TONES: Record<ProjectStatus, Tone> = {
  planning: "primary",
  design: "primary",
  approval: "primary",
  procurement: "primary",
  execution: "primary",
  finishing: "primary",
  handover_pending: "warning",
  completed: "success",
  on_hold: "warning",
  delayed: "danger",
  cancelled: "muted",
};

export const MATERIAL_REQUEST_STATUS_TONES: Record<MaterialRequestStatus, Tone> = {
  requested: "warning",
  pending_review: "warning",
  approved: "success",
  rejected: "danger",
  ordered: "primary",
  partially_delivered: "warning",
  delivered: "success",
  cancelled: "muted",
};

export const MILESTONE_STATUS_TONES: Record<MilestoneStatus, Tone> = {
  not_started: "muted",
  in_progress: "primary",
  completed: "success",
  skipped: "muted",
};

export const USER_STATUS_TONES: Record<UserStatus, Tone> = {
  active: "success",
  inactive: "muted",
};

export const PRIORITY_TONES: Record<PriorityLevel, Tone> = {
  low: "muted",
  medium: "primary",
  high: "warning",
  urgent: "danger",
};

export const DEADLINE_STATE_TONES: Record<DeadlineState, Tone> = {
  completed: "success",
  cancelled: "muted",
  no_date: "muted",
  overdue: "danger",
  due_today: "danger",
  due_tomorrow: "warning",
  due_7: "warning",
  due_14: "primary",
  due_30: "primary",
  on_track: "success",
};

export const REQUIRED_STATE_TONES: Record<RequiredState, Tone> = {
  closed: "muted",
  overdue: "danger",
  due_today: "danger",
  due_tomorrow: "warning",
  due_soon: "warning",
  upcoming: "primary",
};

/* -------------------------------------------------------------------------- */
/* Groupings (ARCHITECTURE §3 "Groupings")                                    */
/* -------------------------------------------------------------------------- */

export const ONGOING_PROJECT_STATUSES = [
  "planning",
  "design",
  "approval",
  "procurement",
  "execution",
  "finishing",
  "handover_pending",
  "delayed",
] as const satisfies readonly ProjectStatus[];

export const CLOSED_PROJECT_STATUSES = [
  "completed",
  "cancelled",
] as const satisfies readonly ProjectStatus[];

export const MATERIAL_PENDING_STATUSES = [
  "requested",
  "pending_review",
] as const satisfies readonly MaterialRequestStatus[];

export const MATERIAL_PROCESSING_STATUSES = [
  "approved",
  "ordered",
  "partially_delivered",
] as const satisfies readonly MaterialRequestStatus[];

export const MATERIAL_COMPLETED_STATUSES = [
  "delivered",
] as const satisfies readonly MaterialRequestStatus[];

export const MATERIAL_CLOSED_STATUSES = [
  "delivered",
  "rejected",
  "cancelled",
] as const satisfies readonly MaterialRequestStatus[];

/** Requests that still need action (pending + processing). */
export const MATERIAL_OPEN_STATUSES = [
  ...MATERIAL_PENDING_STATUSES,
  ...MATERIAL_PROCESSING_STATUSES,
] as const;

/** Statuses in which the requester can still edit the request. */
export const MATERIAL_EDITABLE_STATUSES = MATERIAL_PENDING_STATUSES;

/** Allowed status transitions enforced by `update_material_request_status`. */
export const MATERIAL_REQUEST_TRANSITIONS: Record<
  MaterialRequestStatus,
  readonly MaterialRequestStatus[]
> = {
  requested: ["pending_review", "approved", "rejected", "cancelled"],
  pending_review: ["approved", "rejected", "cancelled"],
  approved: ["ordered", "cancelled"],
  ordered: ["partially_delivered", "delivered", "cancelled"],
  partially_delivered: ["delivered"],
  delivered: [],
  rejected: [],
  cancelled: [],
};

/** Statuses in which deliveries may be recorded. */
export const MATERIAL_DELIVERABLE_STATUSES = [
  "approved",
  "ordered",
  "partially_delivered",
] as const satisfies readonly MaterialRequestStatus[];

export function isOngoingProjectStatus(status: ProjectStatus): boolean {
  return (ONGOING_PROJECT_STATUSES as readonly ProjectStatus[]).includes(status);
}

export function isClosedProjectStatus(status: ProjectStatus): boolean {
  return (CLOSED_PROJECT_STATUSES as readonly ProjectStatus[]).includes(status);
}

export function isClosedMaterialStatus(status: MaterialRequestStatus): boolean {
  return (MATERIAL_CLOSED_STATUSES as readonly MaterialRequestStatus[]).includes(status);
}

export function canTransitionMaterialRequest(
  from: MaterialRequestStatus,
  to: MaterialRequestStatus,
): boolean {
  return MATERIAL_REQUEST_TRANSITIONS[from].includes(to);
}

/* -------------------------------------------------------------------------- */
/* Projects                                                                   */
/* -------------------------------------------------------------------------- */

export const DEFAULT_MILESTONES = [
  "Project Started",
  "Design",
  "Approval",
  "Procurement",
  "Execution",
  "Finishing",
  "Handover",
  "Completed",
] as const;

export const PROJECT_TYPES = [
  "Residential",
  "Apartment",
  "Villa",
  "Office",
  "Retail",
  "Hospitality",
  "Renovation",
  "Other",
] as const;

/** Scope of work (projects.work_scope); keys mirror the 0011 check constraint. */
export const WORK_SCOPES = [
  "living_room",
  "modular_kitchen",
  "dining_room",
  "pooja_unit",
  "1bhk",
  "2bhk",
  "3bhk",
  "home_theatre",
  "false_ceiling",
  "tv_unit",
  "first_floor_living_room",
] as const;
export type WorkScope = (typeof WORK_SCOPES)[number];

export const WORK_SCOPE_LABELS: Record<WorkScope, string> = {
  living_room: "Living Room",
  modular_kitchen: "Modular Kitchen",
  dining_room: "Dining Room",
  pooja_unit: "Pooja Unit",
  "1bhk": "1BHK",
  "2bhk": "2BHK",
  "3bhk": "3BHK",
  home_theatre: "Home Theatre",
  false_ceiling: "False Ceiling",
  tv_unit: "TV Unit",
  first_floor_living_room: "First Floor Living Room",
};

/** Project types that take a scope of work (other types never store one). */
export const SCOPE_PROJECT_TYPES = ["Villa", "Apartment", "Residential"] as const;

export function projectTypeHasScope(projectType: string | null | undefined): boolean {
  const type = projectType?.trim().toLowerCase();
  return Boolean(type) && SCOPE_PROJECT_TYPES.some((t) => t.toLowerCase() === type);
}

/** "All areas" when every scope is selected, otherwise the labels in list order. */
export function formatWorkScope(scope: readonly string[] | null | undefined): string | null {
  const known = WORK_SCOPES.filter((key) => scope?.includes(key));
  if (known.length === 0) return null;
  if (known.length === WORK_SCOPES.length) return "All areas";
  return known.map((key) => WORK_SCOPE_LABELS[key]).join(", ");
}

/** Day thresholds for deadline reminders (mirrors generate_deadline_notifications). */
export const DEADLINE_REMINDER_DAYS = [30, 14, 7, 1, 0] as const;
/** "Near deadline" window used by dashboards. */
export const NEAR_DEADLINE_DAYS = 14;
/** Upcoming handover window used by the owner dashboard. */
export const UPCOMING_HANDOVER_DAYS = 30;
/** Material requests are "due soon" within this many days. */
export const REQUEST_DUE_SOON_DAYS = 7;

/* -------------------------------------------------------------------------- */
/* Materials                                                                  */
/* -------------------------------------------------------------------------- */

export const MATERIAL_CATEGORY_DEFAULTS = [
  "Civil",
  "Electrical",
  "Plumbing",
  "Carpentry",
  "Tiles",
  "Paint",
  "Lighting",
  "Hardware",
  "Furniture",
  "Other",
] as const;

export const MATERIAL_UNITS = [
  "Nos",
  "Bags",
  "Kg",
  "Tonnes",
  "Litres",
  "Sq Ft",
  "Sq M",
  "Running Ft",
  "Metres",
  "Cu Ft",
  "Sheets",
  "Boxes",
  "Rolls",
  "Sets",
  "Pairs",
  "Lot",
] as const;

/* -------------------------------------------------------------------------- */
/* Documents & storage                                                        */
/* -------------------------------------------------------------------------- */

export const PROJECT_DOCUMENTS_BUCKET = "project-documents";
/** Matches the `project-documents` bucket limit (0007_storage_realtime_cron.sql: 26214400 bytes). */
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 60;

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_TYPES = [
  "material_request_new",
  "material_request_status",
  "project_deadline",
  "project_overdue",
  "project_assigned",
  "request_assigned",
  "cost_overrun",
  "request_due",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  material_request_new: "New material request",
  material_request_status: "Request update",
  project_deadline: "Deadline approaching",
  project_overdue: "Project overdue",
  project_assigned: "Project assigned",
  request_assigned: "Request assigned",
  cost_overrun: "Cost overrun",
  request_due: "Request due",
};

export const NOTIFICATION_TYPE_TONES: Record<NotificationType, Tone> = {
  material_request_new: "primary",
  material_request_status: "primary",
  project_deadline: "warning",
  project_overdue: "danger",
  project_assigned: "success",
  request_assigned: "success",
  cost_overrun: "danger",
  request_due: "warning",
};

/** Number of notifications loaded into the topbar panel. */
export const NOTIFICATION_PANEL_LIMIT = 15;

/* -------------------------------------------------------------------------- */
/* Lists, filters & search                                                    */
/* -------------------------------------------------------------------------- */

export const DATE_RANGE_PRESETS = [
  "today",
  "this_week",
  "this_month",
  "next_7",
  "next_30",
  "custom",
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  this_week: "This Week",
  this_month: "This Month",
  next_7: "Next 7 Days",
  next_30: "Next 30 Days",
  custom: "Custom Range",
};

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
export const SEARCH_RESULT_LIMIT = 20;

/** Password policy shared by reset/set-password flows. */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 72;
