import { DOCUMENT_MAX_BYTES, PROJECT_TYPES as FOUNDATION_PROJECT_TYPES } from "@/lib/constants";
import { addDays, todayIST } from "@/lib/dates";

/** `/projects?view=` presets (ARCHITECTURE §9). */
export const PROJECT_VIEWS = [
  "ongoing",
  "completed",
  "delayed",
  "upcoming_handover",
  "near_deadline",
  "on_hold",
  "closed",
] as const;
export type ProjectView = (typeof PROJECT_VIEWS)[number];

export const PROJECT_VIEW_LABELS: Record<ProjectView, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  delayed: "Delayed",
  upcoming_handover: "Upcoming Handover",
  near_deadline: "Near Deadline",
  on_hold: "On Hold",
  closed: "Closed",
};

export const PROJECT_SORT_KEYS = [
  "name",
  "client",
  "status",
  "progress",
  "start_date",
  "expected_completion_date",
  "handover_date",
  "updated_at",
] as const;
export type ProjectSortKey = (typeof PROJECT_SORT_KEYS)[number];

export const PROJECT_SORT_COLUMNS: Record<ProjectSortKey, string> = {
  name: "name",
  client: "client_name",
  status: "status",
  progress: "progress_percentage",
  start_date: "start_date",
  expected_completion_date: "expected_completion_date",
  handover_date: "handover_date",
  updated_at: "updated_at",
};

/** Owner-only archive filter (`?archived=only|include`); default hides archived projects. */
export const PROJECT_ARCHIVE_FILTERS = ["only", "include"] as const;
export type ProjectArchiveFilter = (typeof PROJECT_ARCHIVE_FILTERS)[number];

/** `/projects/[id]?tab=` values (ARCHITECTURE §9). */
export const PROJECT_TABS = [
  "overview",
  "timeline",
  "updates",
  "requests",
  "materials",
  "payments",
  "documents",
  "activity",
] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];

export const PROJECT_TAB_LABELS: Record<ProjectTab, string> = {
  overview: "Overview",
  timeline: "Timeline",
  updates: "Progress Updates",
  requests: "Material Requests",
  materials: "Materials",
  payments: "Payments",
  documents: "Design & Floor Map",
  activity: "Activity",
};

/** Suggested project types (free text is also allowed). */
export const PROJECT_TYPE_SUGGESTIONS: readonly string[] = Array.from(
  new Set([
    "Residential",
    "Villa",
    "Apartment",
    "Office",
    "Commercial",
    "Retail",
    "Hospitality",
    ...FOUNDATION_PROJECT_TYPES.filter((type) => type !== "Other"),
    "1BHK",
    "2BHK",
    "3BHK",
    "Living Room",
    "First Floor Living Room",
    "Dining",
    "Pooja Unit",
    "TV Unit",
    "Home Theatre",
    "False Ceiling",
    "Other",
  ]),
);

/** Storage bucket limit (0007_storage_realtime_cron.sql: 26214400 bytes). */
export const PROJECT_DOCUMENT_MAX_BYTES = DOCUMENT_MAX_BYTES;

/** MIME types accepted by the `project-documents` bucket. */
export const PROJECT_DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "image/vnd.dwg",
  "image/vnd.dxf",
  "application/acad",
  "application/dxf",
  "application/octet-stream",
] as const;

/** `accept=` for the document file picker. */
export const PROJECT_DOCUMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.dwg,.dxf";

/** Default and step for the activity tab "Load more". */
export const ACTIVITY_PAGE_SIZE = 20;
export const ACTIVITY_MAX_LIMIT = 200;
export const UPDATES_PAGE_SIZE = 10;

/** Deadline date reconstructed from `days_remaining` (date-only, IST). */
export function deadlineFromDays(days: number | null | undefined): string | null {
  if (days === null || days === undefined || !Number.isFinite(days)) return null;
  return addDays(todayIST(), days);
}
