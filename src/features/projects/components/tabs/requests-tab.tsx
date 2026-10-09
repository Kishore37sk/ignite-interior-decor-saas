import { ArrowRight, Package, PackagePlus } from "lucide-react";
import Link from "next/link";
import { CurrencyText } from "@/components/shared/currency-text";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { RequiredDateBadge } from "@/components/shared/required-date-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/dates";
import { listRequests, type ProjectRequestRow } from "../../queries";

export type RequestsTabProps = {
  projectId: string;
  page: number;
  pageSize: number;
  /** Owner only: show request costs. */
  showCosts: boolean;
  /** Owner or assigned site manager on an open project. */
  canRequest: boolean;
};

/** Material requests raised for this project (material_request_directory, RLS-scoped). */
export async function RequestsTab({ projectId, page, pageSize, showCosts, canRequest }: RequestsTabProps) {
  const { rows, total } = await listRequests({ column: "project_id", value: projectId }, { page, pageSize, withCosts: showCosts });

  const columns: DataTableColumn<ProjectRequestRow>[] = [
    {
      key: "request",
      header: "Request",
      mobile: "title",
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-text">{row.title}</span>
          <span className="text-xs text-muted">{row.request_code}</span>
        </div>
      ),
    },
    {
      key: "items",
      header: "Items",
      mobile: "subtitle",
      className: "max-w-72",
      cell: (row) => (
        <span className="line-clamp-2 text-sm text-text" title={row.items_summary ?? undefined}>
          {row.items_summary ?? `${row.item_count} ${row.item_count === 1 ? "item" : "items"}`}
        </span>
      ),
    },
    {
      key: "required_date",
      header: "Required",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <span className="tabular-nums">{formatDate(row.required_date)}</span>
          <RequiredDateBadge requiredDate={row.required_date} status={row.status} size="sm" />
        </div>
      ),
    },
    { key: "priority", header: "Priority", cell: (row) => <PriorityBadge value={row.priority} size="sm" /> },
    { key: "status", header: "Status", cell: (row) => <StatusBadge kind="material" value={row.status} size="sm" /> },
    {
      key: "people",
      header: "Requested / Assigned",
      hideBelowLg: true,
      cell: (row) => (
        <div className="flex min-w-0 flex-col text-sm">
          <span className="truncate text-text">{row.requested_by_name ?? "—"}</span>
          <span className="truncate text-xs text-muted">{row.assigned_admin_name ?? "Unassigned"}</span>
        </div>
      ),
    },
    ...(showCosts
      ? [
          {
            key: "cost",
            header: "Cost",
            align: "right" as const,
            cell: (row: ProjectRequestRow) => {
              const value = row.actual_cost ?? row.approved_cost ?? row.estimated_cost ?? null;
              const label = row.actual_cost !== null && row.actual_cost !== undefined
                ? "Actual"
                : row.approved_cost !== null && row.approved_cost !== undefined
                  ? "Approved"
                  : "Estimated";
              return (
                <div className="flex flex-col md:items-end">
                  <CurrencyText value={value} className="font-medium text-text" />
                  {value !== null ? <span className="text-xs text-muted">{label}</span> : null}
                </div>
              );
            },
          },
        ]
      : []),
  ];

  const newRequest = canRequest ? (
    <Button asChild>
      <Link href={`/material-requests/new?project=${projectId}`}>
        <PackagePlus aria-hidden="true" />
        New request
      </Link>
    </Button>
  ) : null;

  return (
    <DataTable
      title="Material requests"
      caption="Material requests for this project"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      getRowHref={(row) => `/material-requests/${row.id}`}
      getRowLabel={(row) => `Open request ${row.request_code}: ${row.title}`}
      pagination={{ total, page, pageSize, itemLabel: "requests" }}
      toolbar={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {total > 0 ? `${total} ${total === 1 ? "request" : "requests"}, newest first.` : "No requests yet."}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {total > 0 ? (
              <Button variant="ghost" asChild>
                <Link href={`/material-requests?project=${projectId}`}>
                  Open in Material Requests
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
            {newRequest}
          </div>
        </div>
      }
      emptyState={
        <EmptyState
          icon={Package}
          title="No material requests"
          description={
            canRequest
              ? "Raise a request when the site needs cement, tiles, wiring or any other material."
              : "Material requests raised for this project will appear here."
          }
          action={newRequest}
        />
      }
    />
  );
}
