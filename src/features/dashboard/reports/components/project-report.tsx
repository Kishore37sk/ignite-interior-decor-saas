import { FolderSearch } from "lucide-react";
import { CurrencyText } from "@/components/shared/currency-text";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { DeadlineBadge } from "@/components/shared/deadline-badge";
import { FilterBar } from "@/components/shared/filter-bar";
import { ProgressBar } from "@/components/shared/progress-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { formatINR, formatNumber, formatPercent } from "@/lib/format";
import type { SearchParamsRecord } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { WidgetError } from "../../components/widget-states";
import {
  REPORT_DESCRIPTIONS,
  REPORT_LABELS,
  exportHref,
  parseProjectReportFilters,
  parseReportPaging,
} from "../config";
import { fetchProjectReport, fetchSiteManagerOptions, type ProjectReportRow } from "../queries";
import { hasActiveFilters } from "./report-utils";
import { ExportCsvButton } from "./export-csv-button";
import { ReportFrame, ReportTotals } from "./report-frame";

const STATUS_OPTIONS = PROJECT_STATUSES.map((status) => ({ value: status, label: PROJECT_STATUS_LABELS[status] }));

const COLUMNS: DataTableColumn<ProjectReportRow>[] = [
  {
    key: "name",
    header: "Project",
    sortable: true,
    mobile: "title",
    cell: (row) => (
      <div className="min-w-0">
        <p className="max-w-56 truncate font-semibold text-text">{row.name}</p>
        <p className="text-xs text-muted">{row.project_code}</p>
      </div>
    ),
  },
  {
    key: "client",
    header: "Client",
    sortable: true,
    mobile: "subtitle",
    cell: (row) => <span className="block max-w-44 truncate">{row.client_name}</span>,
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    cell: (row) => <StatusBadge kind="project" value={row.status} size="sm" />,
  },
  {
    key: "progress",
    header: "Progress",
    sortable: true,
    className: "min-w-32",
    cell: (row) => (
      <ProgressBar value={row.progress_percentage} label={`${row.name} progress`} size="sm" showValue />
    ),
  },
  {
    key: "start_date",
    header: "Start",
    sortable: true,
    hideBelowLg: true,
    cell: (row) => <span className="whitespace-nowrap tabular-nums">{formatDate(row.start_date)}</span>,
  },
  {
    key: "expected_completion_date",
    header: "Expected Completion",
    sortable: true,
    mobileLabel: "Deadline",
    cell: (row) => (
      <div className="flex flex-col items-start gap-1">
        <span className="whitespace-nowrap tabular-nums">{formatDate(row.expected_completion_date)}</span>
        <DeadlineBadge deadline={row.expected_completion_date} status={row.status} size="sm" />
      </div>
    ),
  },
  {
    key: "handover_date",
    header: "Handover",
    sortable: true,
    hideBelowLg: true,
    cell: (row) => (
      <div className="flex flex-col">
        <span className="whitespace-nowrap tabular-nums">{formatDate(row.handover_date)}</span>
        {row.actual_handover_date ? (
          <span className="whitespace-nowrap text-xs text-muted">Handed over {formatDate(row.actual_handover_date)}</span>
        ) : null}
      </div>
    ),
  },
  {
    key: "site_manager",
    header: "Site Manager",
    hideBelowLg: true,
    cell: (row) =>
      row.site_manager_name ? (
        <span className="block max-w-36 truncate">{row.site_manager_name}</span>
      ) : (
        <span className="text-warning-text">Not assigned</span>
      ),
  },
  {
    key: "cost",
    header: "Project Cost",
    align: "right",
    cell: (row) => <CurrencyText value={row.finance?.project_cost ?? null} className="whitespace-nowrap" />,
  },
  {
    key: "material",
    header: "Material (Actual / Est.)",
    align: "right",
    mobileLabel: "Material cost",
    cell: (row) => {
      const f = row.finance;
      if (!f) return <span className="text-muted">—</span>;
      const overrun = f.material_variance > 0 && f.material_actual_cost > 0;
      return (
        <div className="flex flex-col items-end">
          <span className={cn("whitespace-nowrap tabular-nums", overrun && "font-semibold text-danger-text")}>
            {formatINR(f.material_actual_cost, { compact: true })}
            <span className="font-normal text-muted"> / {formatINR(f.material_estimated_cost, { compact: true })}</span>
          </span>
          {overrun ? (
            <span className="text-xs text-danger-text">+{formatINR(f.material_variance, { compact: true })} over</span>
          ) : null}
        </div>
      );
    },
  },
];

/** Owner project report (app.md §76): client, project, cost, status, progress, dates, site manager. */
export async function ProjectReport({ params }: { params: SearchParamsRecord }) {
  const supabase = await createClient();
  const filters = parseProjectReportFilters(params);
  const paging = parseReportPaging(params);
  const [result, smOptions] = await Promise.all([
    fetchProjectReport(supabase, filters, { kind: "page", paging }),
    fetchSiteManagerOptions(supabase),
  ]);

  const filterBar = (
    <FilterBar
      searchPlaceholder="Search project, code, client or city…"
      filters={[
        { param: "status", label: "Status", options: STATUS_OPTIONS, allLabel: "All statuses" },
        { param: "sm", label: "Site manager", options: smOptions, allLabel: "All site managers" },
      ]}
      dateRange={{ label: "Expected completion", anyLabel: "Any completion date" }}
    >
      <ExportCsvButton href={exportHref("projects", params)} disabled={!result.ok || result.total === 0} />
    </FilterBar>
  );

  const frame = { id: "project-report", title: REPORT_LABELS.projects, description: REPORT_DESCRIPTIONS.projects };

  if (!result.ok) {
    return (
      <ReportFrame {...frame} filters={filterBar}>
        <WidgetError title="Project report" message={result.error} />
      </ReportFrame>
    );
  }

  const { totals } = result;
  const filtered = hasActiveFilters(params, ["q", "status", "sm", "range", "from", "to"]);

  return (
    <ReportFrame {...frame} filters={filterBar}>
      {result.total > 0 ? (
        <ReportTotals
          matching={result.total}
          truncated={result.truncated}
          items={[
            { label: "Projects", value: formatNumber(totals.count, 0) },
            {
              label: "Overdue",
              value: formatNumber(totals.overdue, 0),
              tone: totals.overdue > 0 ? "danger" : "default",
            },
            {
              label: "Avg progress",
              value: totals.avgProgress === null ? "—" : formatPercent(totals.avgProgress, 0),
            },
            { label: "Project value", value: <CurrencyText value={totals.projectCost} compact /> },
            { label: "Material estimated", value: <CurrencyText value={totals.materialEstimated} compact /> },
            { label: "Material actual", value: <CurrencyText value={totals.materialActual} compact /> },
            {
              label: "Material variance",
              value: (
                <>
                  {totals.variance > 0 ? "+" : ""}
                  <CurrencyText value={totals.variance} compact />
                </>
              ),
              tone: totals.variance > 0 ? "danger" : totals.variance < 0 ? "success" : "default",
            },
          ]}
        />
      ) : null}
      <DataTable
        bare
        columns={COLUMNS}
        rows={result.rows}
        getRowId={(row) => row.id}
        getRowHref={(row) => `/projects/${row.id}`}
        getRowLabel={(row) => `Open project ${row.project_code}: ${row.name}`}
        caption="Project report"
        sort={{ key: filters.sort, dir: filters.dir }}
        pagination={{ total: result.total, page: result.page ?? paging.page, pageSize: paging.pageSize, itemLabel: "projects" }}
        emptyState={
          <EmptyState
            icon={FolderSearch}
            title={filtered || paging.page > 1 ? "No projects match these filters" : "No projects yet"}
            description={
              filtered || paging.page > 1
                ? "Try a different status, site manager or date range, or clear the filters."
                : "Projects you create appear in this report with their cost, progress and dates."
            }
          />
        }
      />
    </ReportFrame>
  );
}
