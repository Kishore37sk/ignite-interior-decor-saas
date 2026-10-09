import { ClipboardList, Clock, SearchX, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatINR, formatNumber, formatPercent } from "@/lib/format";
import type { SearchParamsRecord } from "@/lib/search-params";
import { formatHours } from "@/features/users/format";
import { AddUserDialog } from "@/features/users/components/add-user-dialog";
import { MetricValue } from "@/features/users/components/metrics";
import { toManagedUser } from "@/features/users/components/types";
import { UserActions } from "@/features/users/components/user-actions";
import { listAdminPerformance, sumOf, type WithProfile } from "@/features/users/performance";
import { getEmployeeIdSuggestions } from "@/features/users/queries";
import type { AdminPerformanceRow } from "@/types/database";

export const metadata: Metadata = { title: "Admins" };

type PageProps = { searchParams: Promise<SearchParamsRecord> };
type Row = WithProfile<AdminPerformanceRow>;

export default async function AdminsPage({ searchParams }: PageProps) {
  const owner = await requireRole("owner");
  const params = await searchParams;
  const [{ filters, rows, total, all, summary }, suggestions] = await Promise.all([
    listAdminPerformance(params),
    getEmployeeIdSuggestions(),
  ]);
  const hasFilters = Boolean(filters.q || filters.status);
  const pending = sumOf(all, (r) => r.pending);
  const processing = sumOf(all, (r) => r.processing);
  const overdue = sumOf(all, (r) => r.overdue);

  const columns: DataTableColumn<Row>[] = [
    {
      key: "name",
      header: "Admin",
      sortable: true,
      mobile: "title",
      className: "min-w-52",
      cell: (row) => (
        <UserAvatar
          name={row.full_name}
          avatarUrl={row.profile?.avatar_url}
          userId={row.user_id}
          subtitle={[row.employee_id, row.profile?.phone].filter(Boolean).join(" · ") || "No employee ID"}
        />
      ),
    },
    {
      key: "status",
      header: "Status",
      mobile: "subtitle",
      cell: (row) => <StatusBadge kind="user" value={row.status} size="sm" />,
    },
    {
      key: "assigned",
      header: "Assigned",
      sortable: true,
      align: "center",
      cell: (row) => <span className="font-semibold tabular-nums">{formatNumber(row.requests_assigned, 0)}</span>,
    },
    {
      key: "pending",
      header: "Pending",
      sortable: true,
      align: "center",
      cell: (row) => (
        <span className="flex flex-col tabular-nums md:items-center">
          <span>{formatNumber(row.pending, 0)}</span>
          <span className="text-[11px] text-muted">{`${row.processing} processing`}</span>
        </span>
      ),
    },
    {
      key: "completed",
      header: "Completed",
      align: "center",
      cell: (row) => (
        <span className="flex flex-col tabular-nums md:items-center">
          <span>{formatNumber(row.completed, 0)}</span>
          <span className="text-[11px] text-muted">{`${row.rejected} rejected`}</span>
        </span>
      ),
    },
    {
      key: "overdue",
      header: "Overdue",
      sortable: true,
      align: "center",
      cell: (row) => (
        <span className={row.overdue > 0 ? "font-semibold text-danger-text tabular-nums" : "tabular-nums"}>
          {formatNumber(row.overdue, 0)}
        </span>
      ),
    },
    {
      key: "completion",
      header: "Completion",
      sortable: true,
      align: "center",
      cell: (row) => (
        <MetricValue
          value={row.completion_rate === null ? null : formatPercent(row.completion_rate, 1)}
          missingHint="No requests yet"
        />
      ),
    },
    {
      key: "response",
      header: "Avg Response",
      sortable: true,
      align: "center",
      cell: (row) => (
        <span className="flex flex-col md:items-center">
          <MetricValue value={formatHours(row.avg_response_hours)} missingHint="Nothing reviewed yet" />
          {row.avg_completion_days !== null ? (
            <span className="text-[11px] text-muted">{`~${formatNumber(row.avg_completion_days, 1)} days to deliver`}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "value",
      header: "Value Managed",
      sortable: true,
      align: "right",
      hideBelowLg: true,
      cell: (row) => <span className="tabular-nums">{formatINR(row.total_value_managed ?? 0, { compact: true })}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      interactive: true,
      cell: (row) =>
        row.profile ? <UserActions user={toManagedUser(row.profile)} currentUserId={owner.id} /> : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Admins"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Admins" }]}
        description="Material request workload, turnaround and overdue items per admin. Rates show “—” until there are requests to measure."
        actions={<AddUserDialog suggestions={suggestions} defaultRole="admin" lockRole label="Add Admin" />}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Admins"
          value={formatNumber(summary.active, 0)}
          unit={`active of ${summary.total}`}
          icon={ShieldCheck}
          href="/admins?status=active"
        />
        <StatCard
          label="Pending Review"
          value={formatNumber(pending, 0)}
          unit="requests"
          icon={ClipboardList}
          href="/material-requests?view=pending"
        />
        <StatCard
          label="Processing"
          value={formatNumber(processing, 0)}
          unit="requests"
          icon={Clock}
          href="/material-requests?view=processing"
        />
        <StatCard
          label="Overdue"
          value={formatNumber(overdue, 0)}
          unit="requests"
          icon={TriangleAlert}
          variant={overdue > 0 ? "danger" : "default"}
          href="/material-requests?view=overdue"
        />
      </div>

      <DataTable
        title="Performance"
        caption="Admins"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.user_id}
        getRowHref={(row) => `/admins/${row.user_id}`}
        getRowLabel={(row) => `Open ${row.full_name}'s profile`}
        sort={{ key: filters.sort, dir: filters.dir }}
        pagination={{ total, page: filters.page, pageSize: filters.pageSize, itemLabel: "admins" }}
        toolbar={
          <FilterBar
            searchPlaceholder="Search name, employee ID, email, phone…"
            filters={[
              {
                param: "status",
                label: "Status",
                allLabel: "Any status",
                options: [
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ],
              },
            ]}
          />
        }
        emptyState={
          hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="No admins match these filters"
              description="Try a different search term or clear the filters."
            />
          ) : (
            <EmptyState
              icon={ShieldCheck}
              title="No admins yet"
              description="Add an admin to review, approve and track material requests."
              action={<AddUserDialog suggestions={suggestions} defaultRole="admin" lockRole label="Add Admin" />}
            />
          )
        }
      />
      <p className="text-xs text-muted">
        Response time runs from request creation to the first review, approval or rejection. Value managed sums the actual (else
        approved, else estimated) cost of requests that weren&apos;t rejected or cancelled.
      </p>
    </div>
  );
}
