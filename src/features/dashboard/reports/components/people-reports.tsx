import { HardHat, ShieldCheck } from "lucide-react";
import { CurrencyText } from "@/components/shared/currency-text";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { ProgressBar } from "@/components/shared/progress-bar";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { USER_STATUSES, USER_STATUS_LABELS } from "@/lib/constants";
import { relativeTime } from "@/lib/dates";
import { formatNumber, formatPercent } from "@/lib/format";
import type { SearchParamsRecord } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { AdminPerformanceRow, SiteManagerPerformanceRow } from "@/types/database";
import { NoRate } from "../../components/no-rate";
import { WidgetError } from "../../components/widget-states";
import { formatCount, formatDays, formatResponseTime } from "../../format";
import {
  REPORT_DESCRIPTIONS,
  REPORT_LABELS,
  exportHref,
  parseAdminReportFilters,
  parseReportPaging,
  parseSmReportFilters,
} from "../config";
import { fetchAdminReport, fetchSiteManagerReport } from "../queries";
import { ExportCsvButton } from "./export-csv-button";
import { ReportFrame, ReportTotals } from "./report-frame";
import { hasActiveFilters } from "./report-utils";

const ACCOUNT_STATUS_FILTER = {
  param: "status",
  label: "Account status",
  options: USER_STATUSES.map((status) => ({ value: status, label: USER_STATUS_LABELS[status] })),
  allLabel: "All accounts",
} as const;

function PersonCell({ row }: { row: { user_id: string; full_name: string; employee_id: string | null; status: string } }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserAvatar name={row.full_name} userId={row.user_id} subtitle={row.employee_id ?? undefined} size="sm" />
      {row.status === "inactive" ? (
        <Badge tone="muted" size="sm">
          Inactive
        </Badge>
      ) : null}
    </div>
  );
}

function rateClass(rate: number): string {
  if (rate >= 80) return "text-success-text";
  if (rate >= 50) return "text-warning-text";
  return "text-danger-text";
}

function signedCount(value: number, tone: "danger" | "warning"): string {
  if (value <= 0) return "text-muted";
  return tone === "danger" ? "font-semibold text-danger-text" : "font-semibold text-warning-text";
}

/* -------------------------------------------------------------------------- */
/* Site managers                                                              */
/* -------------------------------------------------------------------------- */

const SM_COLUMNS: DataTableColumn<SiteManagerPerformanceRow>[] = [
  { key: "name", header: "Site Manager", sortable: true, mobile: "title", cell: (row) => <PersonCell row={row} /> },
  {
    key: "assigned",
    header: "Projects",
    sortable: true,
    align: "right",
    cell: (row) => (
      <span className="tabular-nums">
        <span className="font-semibold">{formatCount(row.assigned_projects)}</span>
        <span className="block text-xs text-muted">{formatCount(row.ongoing_projects)} ongoing</span>
      </span>
    ),
  },
  {
    key: "completed",
    header: "Completed",
    sortable: true,
    align: "right",
    cell: (row) => (
      <span className="tabular-nums">
        <span className="font-semibold">{formatCount(row.completed_projects)}</span>
        <span className="block text-xs text-muted">{formatCount(row.on_time_completed)} on time</span>
      </span>
    ),
  },
  {
    key: "delayed",
    header: "Delayed",
    sortable: true,
    align: "right",
    cell: (row) => (
      <span className={cn("tabular-nums", signedCount(row.delayed_projects, "danger"))}>
        {formatCount(row.delayed_projects)}
      </span>
    ),
  },
  {
    key: "on_time_rate",
    header: "On-time Rate",
    sortable: true,
    align: "right",
    interactive: true,
    cell: (row) =>
      row.on_time_rate === null ? (
        <NoRate reason="Not enough completed projects" />
      ) : (
        <span className={cn("font-semibold tabular-nums", rateClass(row.on_time_rate))}>
          {formatPercent(row.on_time_rate, row.on_time_rate % 1 === 0 ? 0 : 1)}
        </span>
      ),
  },
  {
    key: "avg_progress",
    header: "Avg Progress",
    sortable: true,
    className: "min-w-32",
    cell: (row) =>
      row.avg_progress === null ? (
        <span className="text-muted">—</span>
      ) : (
        <ProgressBar value={row.avg_progress} label={`${row.full_name} average progress`} size="sm" showValue />
      ),
  },
  {
    key: "requests",
    header: "Material Requests",
    sortable: true,
    align: "right",
    mobileLabel: "Requests",
    cell: (row) => (
      <span className="tabular-nums">
        <span className="font-semibold">{formatCount(row.material_requests_created)}</span>
        {row.avg_request_completion_days !== null ? (
          <span className="block text-xs text-muted">{formatDays(row.avg_request_completion_days)} to deliver</span>
        ) : null}
      </span>
    ),
  },
  {
    key: "updates",
    header: "Updates",
    sortable: true,
    align: "right",
    cell: (row) => (
      <span className="tabular-nums">
        <span className="font-semibold">{formatCount(row.project_updates_count)}</span>
        <span className="block whitespace-nowrap text-xs text-muted">
          {row.last_update_at ? `Last ${relativeTime(row.last_update_at)}` : "No updates yet"}
        </span>
      </span>
    ),
  },
];

/** Site manager report (app.md §76): projects, completion, delays, updates and requests. */
export async function SiteManagerReport({ params }: { params: SearchParamsRecord }) {
  const supabase = await createClient();
  const filters = parseSmReportFilters(params);
  const paging = parseReportPaging(params);
  const result = await fetchSiteManagerReport(supabase, filters, { kind: "page", paging });

  const filterBar = (
    <FilterBar searchPlaceholder="Search name or employee ID…" filters={[ACCOUNT_STATUS_FILTER]}>
      <ExportCsvButton href={exportHref("site-managers", params)} disabled={!result.ok || result.total === 0} />
    </FilterBar>
  );
  const frame = {
    id: "site-manager-report",
    title: REPORT_LABELS["site-managers"],
    description: REPORT_DESCRIPTIONS["site-managers"],
  };

  if (!result.ok) {
    return (
      <ReportFrame {...frame} filters={filterBar}>
        <WidgetError title="Site manager report" message={result.error} />
      </ReportFrame>
    );
  }

  const { totals } = result;
  const filtered = hasActiveFilters(params, ["q", "status"]) || paging.page > 1;

  return (
    <ReportFrame {...frame} filters={filterBar}>
      {result.total > 0 ? (
        <ReportTotals
          matching={result.total}
          truncated={result.truncated}
          items={[
            { label: "Site managers", value: formatNumber(totals.count, 0) },
            { label: "Assigned projects", value: formatNumber(totals.assigned, 0) },
            { label: "Ongoing", value: formatNumber(totals.ongoing, 0) },
            { label: "Completed", value: formatNumber(totals.completed, 0) },
            { label: "Delayed", value: formatNumber(totals.delayed, 0), tone: totals.delayed > 0 ? "danger" : "default" },
            {
              label: "On-time rate",
              value: totals.onTimeRate === null ? "—" : formatPercent(totals.onTimeRate, 0),
            },
            { label: "Material requests", value: formatNumber(totals.requests, 0) },
          ]}
        />
      ) : null}
      <DataTable
        bare
        columns={SM_COLUMNS}
        rows={result.rows}
        getRowId={(row) => row.user_id}
        getRowHref={(row) => `/site-managers/${row.user_id}`}
        getRowLabel={(row) => `Open site manager ${row.full_name}`}
        caption="Site manager report"
        sort={{ key: filters.sort, dir: filters.dir }}
        pagination={{ total: result.total, page: paging.page, pageSize: paging.pageSize, itemLabel: "site managers" }}
        emptyState={
          <EmptyState
            icon={HardHat}
            title={filtered ? "No site managers match these filters" : "No site managers yet"}
            description={
              filtered
                ? "Try another name or clear the filters."
                : "Add site managers from Users and assign them to projects to track their delivery here."
            }
          />
        }
      />
    </ReportFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Admins                                                                     */
/* -------------------------------------------------------------------------- */

const ADMIN_COLUMNS: DataTableColumn<AdminPerformanceRow>[] = [
  { key: "name", header: "Admin", sortable: true, mobile: "title", cell: (row) => <PersonCell row={row} /> },
  {
    key: "assigned",
    header: "Assigned",
    sortable: true,
    align: "right",
    cell: (row) => <span className="font-semibold tabular-nums">{formatCount(row.requests_assigned)}</span>,
  },
  {
    key: "pending",
    header: "Pending",
    sortable: true,
    align: "right",
    cell: (row) => <span className={cn("tabular-nums", signedCount(row.pending, "warning"))}>{formatCount(row.pending)}</span>,
  },
  {
    key: "processing",
    header: "Processing",
    align: "right",
    hideBelowLg: true,
    cell: (row) => <span className="tabular-nums">{formatCount(row.processing)}</span>,
  },
  {
    key: "completed",
    header: "Completed",
    sortable: true,
    align: "right",
    cell: (row) => <span className="font-semibold tabular-nums">{formatCount(row.completed)}</span>,
  },
  {
    key: "overdue",
    header: "Overdue",
    sortable: true,
    align: "right",
    cell: (row) => <span className={cn("tabular-nums", signedCount(row.overdue, "danger"))}>{formatCount(row.overdue)}</span>,
  },
  {
    key: "completion_rate",
    header: "Completion",
    sortable: true,
    align: "right",
    interactive: true,
    cell: (row) =>
      row.completion_rate === null ? (
        <NoRate reason="No requests assigned yet" />
      ) : (
        <span className={cn("font-semibold tabular-nums", rateClass(row.completion_rate))}>
          {formatPercent(row.completion_rate, 0)}
        </span>
      ),
  },
  {
    key: "avg_response",
    header: "Avg Response",
    sortable: true,
    align: "right",
    cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatResponseTime(row.avg_response_hours)}</span>,
  },
  {
    key: "avg_completion",
    header: "Avg Processing",
    sortable: true,
    align: "right",
    mobileLabel: "Avg processing time",
    cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatDays(row.avg_completion_days)}</span>,
  },
  {
    key: "value",
    header: "Value Managed",
    sortable: true,
    align: "right",
    hideBelowLg: true,
    cell: (row) => <CurrencyText value={row.total_value_managed} compact className="whitespace-nowrap" />,
  },
];

/** Admin report (app.md §76): requests, processing time, completion and pending requests. */
export async function AdminReport({ params }: { params: SearchParamsRecord }) {
  const supabase = await createClient();
  const filters = parseAdminReportFilters(params);
  const paging = parseReportPaging(params);
  const result = await fetchAdminReport(supabase, filters, { kind: "page", paging });

  const filterBar = (
    <FilterBar searchPlaceholder="Search name or employee ID…" filters={[ACCOUNT_STATUS_FILTER]}>
      <ExportCsvButton href={exportHref("admins", params)} disabled={!result.ok || result.total === 0} />
    </FilterBar>
  );
  const frame = { id: "admin-report", title: REPORT_LABELS.admins, description: REPORT_DESCRIPTIONS.admins };

  if (!result.ok) {
    return (
      <ReportFrame {...frame} filters={filterBar}>
        <WidgetError title="Admin report" message={result.error} />
      </ReportFrame>
    );
  }

  const { totals } = result;
  const filtered = hasActiveFilters(params, ["q", "status"]) || paging.page > 1;

  return (
    <ReportFrame {...frame} filters={filterBar}>
      {result.total > 0 ? (
        <ReportTotals
          matching={result.total}
          truncated={result.truncated}
          items={[
            { label: "Admins", value: formatNumber(totals.count, 0) },
            { label: "Requests assigned", value: formatNumber(totals.assigned, 0) },
            { label: "Pending", value: formatNumber(totals.pending, 0) },
            { label: "Processing", value: formatNumber(totals.processing, 0) },
            { label: "Completed", value: formatNumber(totals.completed, 0) },
            { label: "Overdue", value: formatNumber(totals.overdue, 0), tone: totals.overdue > 0 ? "danger" : "default" },
            {
              label: "Completion rate",
              value: totals.completionRate === null ? "—" : formatPercent(totals.completionRate, 0),
            },
            { label: "Value managed", value: <CurrencyText value={totals.value} compact /> },
          ]}
        />
      ) : null}
      <DataTable
        bare
        columns={ADMIN_COLUMNS}
        rows={result.rows}
        getRowId={(row) => row.user_id}
        getRowHref={(row) => `/admins/${row.user_id}`}
        getRowLabel={(row) => `Open admin ${row.full_name}`}
        caption="Admin report"
        sort={{ key: filters.sort, dir: filters.dir }}
        pagination={{ total: result.total, page: paging.page, pageSize: paging.pageSize, itemLabel: "admins" }}
        emptyState={
          <EmptyState
            icon={ShieldCheck}
            title={filtered ? "No admins match these filters" : "No admins yet"}
            description={
              filtered
                ? "Try another name or clear the filters."
                : "Add admins from Users so material requests can be reviewed and tracked here."
            }
          />
        }
      />
    </ReportFrame>
  );
}
