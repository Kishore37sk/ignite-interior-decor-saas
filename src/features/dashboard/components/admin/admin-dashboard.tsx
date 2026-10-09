import {
  ArrowRight,
  BadgeCheck,
  CircleCheckBig,
  ClipboardList,
  Hourglass,
  Inbox,
  PackageX,
  ShoppingCart,
  Truck,
  UserRoundX,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { RequiredDateBadge } from "@/components/shared/required-date-badge";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/dates";
import { formatNumber, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getAdminStats, getAdminWorkQueue } from "../../queries";
import type { QueueRequest } from "../../types";
import { KpiGridSkeleton, WidgetError } from "../widget-states";

async function AdminKpis() {
  const result = await getAdminStats();
  if (!result.ok) return <WidgetError title="Request summary" message={result.error} />;
  const s = result.data;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard
        label="New Requests"
        value={formatNumber(s.new_requests, 0)}
        icon={Inbox}
        href="/material-requests?status=requested"
        variant="highlight"
      />
      <StatCard
        label="Pending Review"
        value={formatNumber(s.pending_requests, 0)}
        icon={Hourglass}
        href="/material-requests?view=pending"
      />
      <StatCard label="Approved" value={formatNumber(s.approved, 0)} icon={BadgeCheck} href="/material-requests?status=approved" />
      <StatCard label="Ordered" value={formatNumber(s.ordered, 0)} icon={ShoppingCart} href="/material-requests?status=ordered" />
      <StatCard
        label="Partially Delivered"
        value={formatNumber(s.partially_delivered, 0)}
        icon={Truck}
        href="/material-requests?status=partially_delivered"
      />
      <StatCard
        label="Completed"
        value={formatNumber(s.completed, 0)}
        unit="Delivered"
        icon={CircleCheckBig}
        href="/material-requests?view=completed"
      />
      <StatCard
        label="Overdue"
        value={formatNumber(s.overdue_requests, 0)}
        unit="Past required date"
        icon={PackageX}
        href="/material-requests?view=overdue"
        variant={s.overdue_requests > 0 ? "danger" : "default"}
      />
      <StatCard
        label="Unassigned"
        value={formatNumber(s.unassigned, 0)}
        unit="Open"
        icon={UserRoundX}
        href="/material-requests?view=unassigned"
      />
    </div>
  );
}

const QUEUE_COLUMNS: DataTableColumn<QueueRequest>[] = [
  {
    key: "request",
    header: "Request ID",
    mobile: "title",
    cell: (row) => (
      <div className="min-w-0">
        <p className="font-semibold text-text">{row.request_code}</p>
        <p className="max-w-56 truncate text-xs text-muted">{row.title}</p>
      </div>
    ),
  },
  {
    key: "project",
    header: "Project",
    mobile: "subtitle",
    cell: (row) => (
      <div className="min-w-0">
        <p className="max-w-48 truncate text-text">{row.project_name}</p>
        <p className="text-xs text-muted">{row.project_code}</p>
      </div>
    ),
  },
  {
    key: "material",
    header: "Material",
    cell: (row) => (
      <span className="line-clamp-2 max-w-60 text-sm">{row.items_summary || <span className="text-muted">—</span>}</span>
    ),
  },
  {
    key: "items",
    header: "Quantity",
    align: "right",
    hideBelowLg: true,
    cell: (row) =>
      row.firstItem ? (
        <span className="flex flex-col tabular-nums md:items-end">
          <span className="whitespace-nowrap text-text">{formatQuantity(row.firstItem.quantity, row.firstItem.unit)}</span>
          {row.item_count > 1 ? (
            <span className="text-xs text-muted">+{formatNumber(row.item_count - 1, 0)} more {row.item_count - 1 === 1 ? "item" : "items"}</span>
          ) : null}
        </span>
      ) : (
        <span className="tabular-nums">
          {formatNumber(row.item_count, 0)} {row.item_count === 1 ? "item" : "items"}
        </span>
      ),
  },
  {
    key: "required",
    header: "Required Date",
    cell: (row) => (
      <div className="flex flex-col items-start gap-1">
        <span className="tabular-nums">{formatDate(row.required_date)}</span>
        <RequiredDateBadge requiredDate={row.required_date} status={row.status} size="sm" />
      </div>
    ),
  },
  {
    key: "priority",
    header: "Priority",
    cell: (row) => <PriorityBadge value={row.priority} size="sm" />,
  },
  {
    key: "requested_by",
    header: "Requested By",
    hideBelowLg: true,
    cell: (row) => <span className="truncate">{row.requested_by_name ?? "—"}</span>,
  },
  {
    key: "status",
    header: "Status",
    cell: (row) => <StatusBadge kind="material" value={row.status} size="sm" />,
  },
  {
    key: "assigned",
    header: "Assigned To",
    cell: (row) => (
      <span className={cn("truncate", row.assigned_admin_name ? "text-text" : "font-medium text-warning-text")}>
        {row.assigned_admin_name ?? "Unassigned"}
      </span>
    ),
  },
  {
    key: "action",
    header: "Action",
    align: "right",
    interactive: true,
    mobile: "hidden",
    cell: (row) => (
      <Button asChild size="sm" variant="secondary">
        <Link href={`/material-requests/${row.id}`} aria-label={`Open request ${row.request_code}`}>
          Open
        </Link>
      </Button>
    ),
  },
];

async function WorkQueue({ page: requestedPage, pageSize }: { page: number; pageSize: number }) {
  const result = await getAdminWorkQueue(requestedPage, pageSize);
  if (!result.ok) return <WidgetError title="Work queue" message={result.error} />;
  const { rows, total } = result.data;
  const page = result.data.page ?? requestedPage;

  return (
    <DataTable
      title="Work Queue"
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted">Open requests, most urgent first</p>
          <Button asChild variant="secondary" size="sm" className="lg:ml-auto">
            <Link href="/material-requests">
              All requests
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      }
      columns={QUEUE_COLUMNS}
      rows={rows}
      getRowId={(row) => row.id}
      getRowHref={(row) => `/material-requests/${row.id}`}
      getRowLabel={(row) => `Open request ${row.request_code}: ${row.title}`}
      caption="Open material requests, most urgent first"
      pagination={{ total, page, pageSize, itemLabel: "open requests" }}
      emptyState={
        <EmptyState
          icon={ClipboardList}
          title={page > 1 ? "No requests on this page" : "The queue is clear"}
          description={
            page > 1
              ? "Go back to the first page to see the most urgent requests."
              : "There are no open material requests waiting on you. New requests appear here as site managers raise them."
          }
        />
      }
    />
  );
}

/** Admin dashboard (app.md §29): material request workload. No client contact or project cost. */
export function AdminDashboard({ page, pageSize }: { page: number; pageSize: number }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Material request workload across the projects you handle."
        actions={
          <Button asChild variant="outline">
            <Link href="/material-requests?view=mine">My requests</Link>
          </Button>
        }
      />
      <Suspense fallback={<KpiGridSkeleton count={8} className="grid-cols-2 lg:grid-cols-4" />}>
        <AdminKpis />
      </Suspense>
      <Suspense key={`${page}-${pageSize}`} fallback={<TableSkeleton rows={8} columns={8} toolbar={false} />}>
        <WorkQueue page={page} pageSize={pageSize} />
      </Suspense>
    </div>
  );
}
