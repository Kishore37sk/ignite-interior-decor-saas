import { PackageSearch } from "lucide-react";
import { CurrencyText } from "@/components/shared/currency-text";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { FilterBar, type FilterSelect } from "@/components/shared/filter-bar";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { RequiredDateBadge } from "@/components/shared/required-date-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MATERIAL_REQUEST_STATUSES, MATERIAL_REQUEST_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import type { SearchParamsRecord } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/types/database";
import { WidgetError } from "../../components/widget-states";
import {
  REPORT_LABELS,
  exportHref,
  materialCostVisibility,
  parseMaterialReportFilters,
  parseReportPaging,
} from "../config";
import { fetchMaterialReport, fetchSiteManagerOptions, type MaterialReportRow } from "../queries";
import { ExportCsvButton } from "./export-csv-button";
import { ReportFrame, ReportTotals, type ReportTotalItem } from "./report-frame";
import { hasActiveFilters } from "./report-utils";

const STATUS_OPTIONS = MATERIAL_REQUEST_STATUSES.map((status) => ({
  value: status,
  label: MATERIAL_REQUEST_STATUS_LABELS[status],
}));

function columnsFor(role: AppRole): DataTableColumn<MaterialReportRow>[] {
  const costs = materialCostVisibility(role);
  const columns: DataTableColumn<MaterialReportRow>[] = [
    {
      key: "request",
      header: "Request",
      mobile: "title",
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-text">{row.request_code}</p>
          <p className="max-w-52 truncate text-xs text-muted">{row.title}</p>
        </div>
      ),
    },
    {
      key: "project",
      header: "Project",
      mobile: "subtitle",
      cell: (row) => (
        <div className="min-w-0">
          <p className="max-w-44 truncate text-text">{row.project_name}</p>
          <p className="text-xs text-muted">{row.project_code}</p>
        </div>
      ),
    },
    {
      key: "material",
      header: "Material & Quantity",
      mobileLabel: "Materials",
      cell: (row) =>
        row.items_summary ? (
          <span className="line-clamp-2 max-w-64 text-sm" title={row.items_summary}>
            {row.items_summary}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "required_date",
      header: "Required Date",
      sortable: true,
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <span className="whitespace-nowrap tabular-nums">{formatDate(row.required_date)}</span>
          <RequiredDateBadge requiredDate={row.required_date} status={row.status} size="sm" />
        </div>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      sortable: true,
      hideBelowLg: true,
      cell: (row) => <PriorityBadge value={row.priority} size="sm" />,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (row) => <StatusBadge kind="material" value={row.status} size="sm" />,
    },
    {
      key: "people",
      header: "Requested / Assigned",
      hideBelowLg: true,
      mobileLabel: "Requested by",
      cell: (row) => (
        <div className="min-w-0">
          <p className="max-w-36 truncate">{row.requested_by_name ?? "—"}</p>
          <p className={cn("max-w-36 truncate text-xs", row.assigned_admin_name ? "text-muted" : "text-warning-text")}>
            {row.assigned_admin_name ?? "Unassigned"}
          </p>
        </div>
      ),
    },
  ];
  if (costs.estimated) {
    columns.push({
      key: "estimated_cost",
      header: "Estimated",
      sortable: true,
      align: "right",
      cell: (row) => <CurrencyText value={row.estimated_cost} className="whitespace-nowrap" />,
    });
  }
  if (costs.approvedActual) {
    columns.push({
      key: "actual_cost",
      header: "Actual",
      align: "right",
      cell: (row) => {
        const overrun = row.cost_variance !== null && Number(row.cost_variance) > 0;
        return (
          <div className="flex flex-col items-end">
            <CurrencyText
              value={row.actual_cost}
              className={cn("whitespace-nowrap", overrun && "font-semibold text-danger-text")}
            />
            {row.approved_cost !== null ? (
              <span className="whitespace-nowrap text-xs text-muted">
                Approved <CurrencyText value={row.approved_cost} compact />
              </span>
            ) : null}
          </div>
        );
      },
    });
  }
  return columns;
}

/**
 * Material report (app.md §76). Owner sees every request; admins and site managers see
 * only what RLS lets them access, and site managers only the estimated cost (§85).
 */
export async function MaterialReport({ params, role }: { params: SearchParamsRecord; role: AppRole }) {
  const supabase = await createClient();
  const filters = parseMaterialReportFilters(params, role);
  const paging = parseReportPaging(params);
  const costs = materialCostVisibility(role);
  const [result, smOptions] = await Promise.all([
    fetchMaterialReport(supabase, filters, { kind: "page", paging }),
    role === "site_manager" ? Promise.resolve([]) : fetchSiteManagerOptions(supabase),
  ]);

  const selects: FilterSelect[] = [{ param: "status", label: "Status", options: STATUS_OPTIONS, allLabel: "All statuses" }];
  if (role !== "site_manager") {
    selects.push({ param: "sm", label: "Requested by", options: smOptions, allLabel: "All site managers" });
  }

  const filterBar = (
    <FilterBar
      searchPlaceholder="Search request, material or project…"
      filters={selects}
      dateRange={{ label: "Required date", anyLabel: "Any required date" }}
    >
      <ExportCsvButton href={exportHref("materials", params)} disabled={!result.ok || result.total === 0} />
    </FilterBar>
  );

  const frame = {
    id: "material-report",
    title: REPORT_LABELS.materials,
    description:
      role === "owner"
        ? "Material requests with items, quantities, required dates, status and costs."
        : "Material requests on the projects you work on, with items, required dates and status.",
  };

  if (!result.ok) {
    return (
      <ReportFrame {...frame} filters={filterBar}>
        <WidgetError title="Material report" message={result.error} />
      </ReportFrame>
    );
  }

  const { totals } = result;
  const items: ReportTotalItem[] = [
    { label: "Requests", value: formatNumber(totals.count, 0) },
    { label: "Overdue", value: formatNumber(totals.overdue, 0), tone: totals.overdue > 0 ? "danger" : "default" },
    { label: "Estimated cost", value: <CurrencyText value={totals.estimated} compact /> },
  ];
  if (costs.approvedActual) {
    items.push(
      { label: "Approved cost", value: <CurrencyText value={totals.approved} compact /> },
      { label: "Actual cost", value: <CurrencyText value={totals.actual} compact /> },
      {
        label: "Variance (actual − est.)",
        value: (
          <>
            {totals.variance > 0 ? "+" : ""}
            <CurrencyText value={totals.variance} compact />
          </>
        ),
        tone: totals.variance > 0 ? "danger" : totals.variance < 0 ? "success" : "default",
      },
    );
  }

  const filtered = hasActiveFilters(params, ["q", "status", "sm", "range", "from", "to"]) || paging.page > 1;

  return (
    <ReportFrame {...frame} filters={filterBar}>
      {result.total > 0 ? <ReportTotals matching={result.total} truncated={result.truncated} items={items} /> : null}
      <DataTable
        bare
        columns={columnsFor(role)}
        rows={result.rows}
        getRowId={(row) => row.id}
        getRowHref={(row) => `/material-requests/${row.id}`}
        getRowLabel={(row) => `Open request ${row.request_code}: ${row.title}`}
        caption="Material report"
        sort={{ key: filters.sort, dir: filters.dir }}
        pagination={{ total: result.total, page: result.page ?? paging.page, pageSize: paging.pageSize, itemLabel: "requests" }}
        emptyState={
          <EmptyState
            icon={PackageSearch}
            title={filtered ? "No requests match these filters" : "No material requests yet"}
            description={
              filtered
                ? "Try a different status or date range, or clear the filters."
                : "Material requests raised by site managers appear here with their items, dates and costs."
            }
          />
        }
      />
    </ReportFrame>
  );
}
