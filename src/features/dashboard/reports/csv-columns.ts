/**
 * CSV column definitions for `/api/reports/[type]`. Values are raw (numbers unformatted,
 * dates as `YYYY-MM-DD`) so spreadsheets can sort and sum them.
 */
import type { CsvColumn, CsvValue } from "@/lib/csv";
import {
  MATERIAL_REQUEST_STATUS_LABELS,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  USER_STATUS_LABELS,
} from "@/lib/constants";
import { toDateOnly } from "@/lib/dates";
import type { AdminPerformanceRow, AppRole, SiteManagerPerformanceRow } from "@/types/database";
import { materialCostVisibility } from "./config";
import type { MaterialReportRow, ProjectReportRow } from "./queries";

function round(value: number | null | undefined, decimals = 1): CsvValue {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function num(value: number | string | null | undefined): CsvValue {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export const PROJECT_CSV_COLUMNS: readonly CsvColumn<ProjectReportRow>[] = [
  { header: "Project Code", value: "project_code" },
  { header: "Project", value: "name" },
  { header: "Client", value: "client_name" },
  { header: "Status", value: (row) => PROJECT_STATUS_LABELS[row.status] },
  { header: "Priority", value: (row) => PRIORITY_LABELS[row.priority] },
  { header: "Progress %", value: (row) => num(row.progress_percentage) },
  { header: "Start Date", value: "start_date" },
  { header: "Expected Completion", value: "expected_completion_date" },
  { header: "Handover Date", value: "handover_date" },
  { header: "Actual Handover", value: "actual_handover_date" },
  { header: "Site Manager", value: (row) => row.site_manager_name ?? "" },
  { header: "Overdue", value: (row) => row.is_overdue },
  { header: "Project Cost (INR)", value: (row) => row.finance?.project_cost ?? null },
  { header: "Material Estimated (INR)", value: (row) => row.finance?.material_estimated_cost ?? null },
  { header: "Material Actual (INR)", value: (row) => row.finance?.material_actual_cost ?? null },
  { header: "Material Variance (INR)", value: (row) => row.finance?.material_variance ?? null },
];

/** Material report columns; approved/actual costs are omitted for site managers (app.md §85). */
export function materialCsvColumns(role: AppRole): CsvColumn<MaterialReportRow>[] {
  const costs = materialCostVisibility(role);
  const columns: CsvColumn<MaterialReportRow>[] = [
    { header: "Request ID", value: "request_code" },
    { header: "Title", value: "title" },
    { header: "Project Code", value: "project_code" },
    { header: "Project", value: "project_name" },
    { header: "Materials", value: "items_summary" },
    { header: "Items", value: (row) => num(row.item_count) },
    { header: "Required Date", value: "required_date" },
    { header: "Priority", value: (row) => PRIORITY_LABELS[row.priority] },
    { header: "Status", value: (row) => MATERIAL_REQUEST_STATUS_LABELS[row.status] },
    { header: "Requested By", value: (row) => row.requested_by_name ?? "" },
    { header: "Assigned Admin", value: (row) => row.assigned_admin_name ?? "Unassigned" },
  ];
  if (costs.estimated) columns.push({ header: "Estimated Cost (INR)", value: (row) => num(row.estimated_cost) });
  if (costs.approvedActual) {
    columns.push(
      { header: "Approved Cost (INR)", value: (row) => num(row.approved_cost) },
      { header: "Actual Cost (INR)", value: (row) => num(row.actual_cost) },
    );
  }
  columns.push(
    { header: "Delivery Date", value: "delivery_date" },
    { header: "Created", value: (row) => toDateOnly(row.created_at) },
  );
  return columns;
}

export const SITE_MANAGER_CSV_COLUMNS: readonly CsvColumn<SiteManagerPerformanceRow>[] = [
  { header: "Employee ID", value: (row) => row.employee_id ?? "" },
  { header: "Site Manager", value: "full_name" },
  { header: "Account Status", value: (row) => USER_STATUS_LABELS[row.status] },
  { header: "Assigned Projects", value: "assigned_projects" },
  { header: "Ongoing", value: "ongoing_projects" },
  { header: "Completed", value: "completed_projects" },
  { header: "Delayed", value: "delayed_projects" },
  { header: "Completed On Time", value: "on_time_completed" },
  { header: "On-time Rate %", value: (row) => round(row.on_time_rate) },
  { header: "Avg Progress %", value: (row) => round(row.avg_progress) },
  { header: "Material Requests", value: "material_requests_created" },
  { header: "Avg Request Completion (days)", value: (row) => round(row.avg_request_completion_days) },
  { header: "Project Updates", value: "project_updates_count" },
  { header: "Last Project Update", value: (row) => toDateOnly(row.last_update_at) },
];

export const ADMIN_CSV_COLUMNS: readonly CsvColumn<AdminPerformanceRow>[] = [
  { header: "Employee ID", value: (row) => row.employee_id ?? "" },
  { header: "Admin", value: "full_name" },
  { header: "Account Status", value: (row) => USER_STATUS_LABELS[row.status] },
  { header: "Requests Assigned", value: "requests_assigned" },
  { header: "Pending", value: "pending" },
  { header: "Processing", value: "processing" },
  { header: "Completed", value: "completed" },
  { header: "Rejected", value: "rejected" },
  { header: "Overdue", value: "overdue" },
  { header: "Completion Rate %", value: (row) => round(row.completion_rate) },
  { header: "Avg Response (hours)", value: (row) => round(row.avg_response_hours) },
  { header: "Avg Completion (days)", value: (row) => round(row.avg_completion_days) },
  { header: "Total Value Managed (INR)", value: (row) => num(row.total_value_managed) },
];
