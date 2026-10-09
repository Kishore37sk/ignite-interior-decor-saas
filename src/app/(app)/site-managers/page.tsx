import { CalendarCheck, FolderKanban, HardHat, SearchX, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressBar } from "@/components/shared/progress-bar";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { relativeTime } from "@/lib/dates";
import { formatNumber, formatPercent } from "@/lib/format";
import type { SearchParamsRecord } from "@/lib/search-params";
import { AddUserDialog } from "@/features/users/components/add-user-dialog";
import { MetricValue } from "@/features/users/components/metrics";
import { toManagedUser } from "@/features/users/components/types";
import { UserActions } from "@/features/users/components/user-actions";
import { listSiteManagerPerformance, sumOf, type WithProfile } from "@/features/users/performance";
import { getEmployeeIdSuggestions } from "@/features/users/queries";
import type { SiteManagerPerformanceRow } from "@/types/database";

export const metadata: Metadata = { title: "Site Managers" };

type PageProps = { searchParams: Promise<SearchParamsRecord> };
type Row = WithProfile<SiteManagerPerformanceRow>;

export default async function SiteManagersPage({ searchParams }: PageProps) {
  const owner = await requireRole("owner");
  const params = await searchParams;
  const [{ filters, rows, total, all, summary }, suggestions] = await Promise.all([
    listSiteManagerPerformance(params),
    getEmployeeIdSuggestions(),
  ]);
  const hasFilters = Boolean(filters.q || filters.status);

  const completed = sumOf(all, (r) => r.completed_projects);
  const onTime = sumOf(all, (r) => r.on_time_completed);
  const ongoing = sumOf(all, (r) => r.ongoing_projects);
  const delayed = sumOf(all, (r) => r.delayed_projects);

  const columns: DataTableColumn<Row>[] = [
    {
      key: "name",
      header: "Site Manager",
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
      cell: (row) => (
        <span className="flex flex-col tabular-nums md:items-center">
          <span className="font-semibold text-text">{formatNumber(row.assigned_projects, 0)}</span>
          <span className="text-[11px] text-muted">{`${row.completed_projects} completed`}</span>
        </span>
      ),
    },
    {
      key: "ongoing",
      header: "Ongoing",
      sortable: true,
      align: "center",
      cell: (row) => <span className="tabular-nums">{formatNumber(row.ongoing_projects, 0)}</span>,
    },
    {
      key: "delayed",
      header: "Delayed",
      sortable: true,
      align: "center",
      cell: (row) => (
        <span className={row.delayed_projects > 0 ? "font-semibold text-danger-text tabular-nums" : "tabular-nums"}>
          {formatNumber(row.delayed_projects, 0)}
        </span>
      ),
    },
    {
      key: "on_time",
      header: "On-time %",
      sortable: true,
      align: "center",
      cell: (row) => (
        <MetricValue
          value={row.on_time_rate === null ? null : `${formatPercent(row.on_time_rate, 1)} (${row.on_time_completed}/${row.completed_projects})`}
          missingHint="No completed projects"
        />
      ),
    },
    {
      key: "progress",
      header: "Avg Progress",
      sortable: true,
      className: "min-w-32",
      cell: (row) =>
        row.avg_progress === null ? (
          <MetricValue value={null} missingHint="No projects yet" />
        ) : (
          <ProgressBar value={row.avg_progress} label={`${row.full_name} average progress`} size="sm" tone="primary" />
        ),
    },
    {
      key: "requests",
      header: "Requests",
      sortable: true,
      align: "center",
      hideBelowLg: true,
      cell: (row) => (
        <span className="flex flex-col tabular-nums md:items-center">
          <span className="text-text">{formatNumber(row.material_requests_created, 0)}</span>
          <span className="text-[11px] text-muted">
            {row.avg_request_completion_days === null
              ? "No deliveries yet"
              : `~${formatNumber(row.avg_request_completion_days, 1)} days to deliver`}
          </span>
        </span>
      ),
    },
    {
      key: "last_update",
      header: "Updates",
      sortable: true,
      cell: (row) => (
        <span className="flex flex-col tabular-nums">
          <span className="text-text">{formatNumber(row.project_updates_count, 0)}</span>
          <span className="whitespace-nowrap text-[11px] text-muted">
            {row.last_update_at ? `Last ${relativeTime(row.last_update_at)}` : "No updates yet"}
          </span>
        </span>
      ),
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
        title="Site Managers"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Site Managers" }]}
        description="Workload, deadlines and update activity for every site manager. Metrics show “—” until there is enough history to be meaningful."
        actions={<AddUserDialog suggestions={suggestions} defaultRole="site_manager" lockRole label="Add Site Manager" />}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Site Managers"
          value={formatNumber(summary.active, 0)}
          unit={`active of ${summary.total}`}
          icon={HardHat}
          href="/site-managers?status=active"
        />
        <StatCard
          label="Ongoing Assignments"
          value={formatNumber(ongoing, 0)}
          unit="projects"
          icon={FolderKanban}
          href="/projects?view=ongoing"
        />
        <StatCard
          label="Delayed"
          value={formatNumber(delayed, 0)}
          unit="projects"
          icon={TriangleAlert}
          variant={delayed > 0 ? "danger" : "default"}
          href="/projects?view=delayed"
        />
        <StatCard
          label="On-time Handover"
          value={completed > 0 ? formatPercent((onTime * 100) / completed, 1) : "—"}
          unit={completed > 0 ? `${onTime} of ${completed} completed` : undefined}
          sub={completed > 0 ? undefined : "No completed projects yet"}
          icon={CalendarCheck}
        />
      </div>

      <DataTable
        title="Performance"
        caption="Site managers"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.user_id}
        getRowHref={(row) => `/site-managers/${row.user_id}`}
        getRowLabel={(row) => `Open ${row.full_name}'s profile`}
        sort={{ key: filters.sort, dir: filters.dir }}
        pagination={{ total, page: filters.page, pageSize: filters.pageSize, itemLabel: "site managers" }}
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
              title="No site managers match these filters"
              description="Try a different search term or clear the filters."
            />
          ) : (
            <EmptyState
              icon={HardHat}
              title="No site managers yet"
              description="Add a site manager, then assign them to projects so they can post progress updates and request materials."
              action={
                <AddUserDialog suggestions={suggestions} defaultRole="site_manager" lockRole label="Add Site Manager" />
              }
            />
          )
        }
      />
      <p className="text-xs text-muted">
        On-time % compares the actual handover with the planned handover date for completed projects only. Average
        progress excludes cancelled projects. See{" "}
        <Link href="/reports" className="font-medium text-primary-strong hover:underline">
          Reports
        </Link>{" "}
        for exports.
      </p>
    </div>
  );
}
