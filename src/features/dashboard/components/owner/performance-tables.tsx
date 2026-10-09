import { ArrowRight, HardHat, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { ProgressBar } from "@/components/shared/progress-bar";
import { SectionCard } from "@/components/shared/section-card";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdminPerformanceRow, SiteManagerPerformanceRow } from "@/types/database";
import { formatCount, formatDays, formatResponseTime } from "../../format";
import { getAdminPerformance, getSiteManagerPerformance } from "../../queries";
import { NoRate } from "../no-rate";
import { WidgetError } from "../widget-states";

const viewAllClass =
  "inline-flex h-9 items-center gap-1 rounded-xl bg-soft px-3 text-sm font-semibold text-deep transition-colors hover:bg-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function PersonCell({
  name,
  employeeId,
  userId,
  inactive,
}: {
  name: string;
  employeeId: string | null;
  userId: string;
  inactive: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserAvatar name={name} userId={userId} subtitle={employeeId ?? undefined} size="sm" />
      {inactive ? (
        <Badge tone="muted" size="sm">
          Inactive
        </Badge>
      ) : null}
    </div>
  );
}

function rateTone(rate: number): string {
  if (rate >= 80) return "text-success-text";
  if (rate >= 50) return "text-warning-text";
  return "text-danger-text";
}

const SM_COLUMNS: DataTableColumn<SiteManagerPerformanceRow>[] = [
  {
    key: "name",
    header: "Site Manager",
    mobile: "title",
    cell: (row) => (
      <PersonCell
        name={row.full_name}
        employeeId={row.employee_id}
        userId={row.user_id}
        inactive={row.status === "inactive"}
      />
    ),
  },
  {
    key: "projects",
    header: "Projects",
    align: "right",
    cell: (row) => (
      <span className="tabular-nums">
        <span className="font-semibold">{formatCount(row.assigned_projects)}</span>
        <span className="block text-xs text-muted">{formatCount(row.ongoing_projects)} ongoing</span>
      </span>
    ),
  },
  {
    key: "on_time",
    header: "On Time",
    align: "right",
    cell: (row) => (
      <span className="tabular-nums">
        <span className="font-semibold">{formatCount(row.on_time_completed)}</span>
        <span className="text-muted"> / {formatCount(row.completed_projects)} done</span>
      </span>
    ),
  },
  {
    key: "delayed",
    header: "Delayed",
    align: "right",
    cell: (row) => (
      <span className={cn("font-semibold tabular-nums", row.delayed_projects > 0 ? "text-danger-text" : "text-muted")}>
        {formatCount(row.delayed_projects)}
      </span>
    ),
  },
  {
    key: "requests",
    header: "Material Requests",
    align: "right",
    mobileLabel: "Requests",
    cell: (row) => <span className="tabular-nums">{formatCount(row.material_requests_created)}</span>,
  },
  {
    key: "progress",
    header: "Avg Progress",
    className: "min-w-36",
    cell: (row) =>
      row.avg_progress === null ? (
        <span className="text-muted">—</span>
      ) : (
        <ProgressBar value={row.avg_progress} label={`${row.full_name} average project progress`} size="sm" />
      ),
  },
  {
    key: "rate",
    header: "On-time Rate",
    align: "right",
    interactive: true,
    cell: (row) =>
      row.on_time_rate === null ? (
        <NoRate reason="Not enough completed projects" />
      ) : (
        <span className={cn("font-semibold tabular-nums", rateTone(row.on_time_rate))}>
          {formatPercent(row.on_time_rate, row.on_time_rate % 1 === 0 ? 0 : 1)}
        </span>
      ),
  },
];

/** Site manager performance (app.md §11/§35/§79). Rows drill into /site-managers/[id]. */
export async function SiteManagerPerformanceTable() {
  const result = await getSiteManagerPerformance();
  if (!result.ok) return <WidgetError title="Site manager performance" message={result.error} />;
  // Hide deactivated accounts that never had projects; keep anyone with history.
  const rows = result.data.filter((row) => row.status === "active" || row.assigned_projects > 0);

  return (
    <SectionCard
      title="Site Manager Performance"
      description="On-time rate = completed on or before the handover date ÷ completed projects"
      action={
        <Link href="/reports?tab=site-managers" className={viewAllClass}>
          Full report
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      }
    >
      <DataTable
        bare
        columns={SM_COLUMNS}
        rows={rows}
        getRowId={(row) => row.user_id}
        getRowHref={(row) => `/site-managers/${row.user_id}`}
        getRowLabel={(row) => `Open site manager ${row.full_name}`}
        caption="Site manager performance"
        emptyState={
          <EmptyState
            compact
            icon={HardHat}
            title="No site managers yet"
            description="Add site managers from Users and assign them to projects to track their delivery."
          />
        }
      />
    </SectionCard>
  );
}

const ADMIN_COLUMNS: DataTableColumn<AdminPerformanceRow>[] = [
  {
    key: "name",
    header: "Admin",
    mobile: "title",
    cell: (row) => (
      <PersonCell
        name={row.full_name}
        employeeId={row.employee_id}
        userId={row.user_id}
        inactive={row.status === "inactive"}
      />
    ),
  },
  {
    key: "assigned",
    header: "Assigned",
    align: "right",
    cell: (row) => <span className="font-semibold tabular-nums">{formatCount(row.requests_assigned)}</span>,
  },
  {
    key: "pending",
    header: "Pending",
    align: "right",
    cell: (row) => (
      <span className={cn("tabular-nums", row.pending > 0 ? "font-semibold text-warning-text" : "text-muted")}>
        {formatCount(row.pending)}
      </span>
    ),
  },
  {
    key: "processing",
    header: "Processing",
    align: "right",
    cell: (row) => <span className="tabular-nums">{formatCount(row.processing)}</span>,
  },
  {
    key: "completed",
    header: "Completed",
    align: "right",
    cell: (row) => (
      <span className="tabular-nums">
        <span className="font-semibold">{formatCount(row.completed)}</span>
        {row.completion_rate !== null ? (
          <span className="block text-xs text-muted">{formatPercent(row.completion_rate, 0)} rate</span>
        ) : null}
      </span>
    ),
  },
  {
    key: "overdue",
    header: "Overdue",
    align: "right",
    cell: (row) => (
      <span className={cn("font-semibold tabular-nums", row.overdue > 0 ? "text-danger-text" : "text-muted")}>
        {formatCount(row.overdue)}
      </span>
    ),
  },
  {
    key: "completion_time",
    header: "Avg Completion",
    align: "right",
    cell: (row) => <span className="tabular-nums">{formatDays(row.avg_completion_days)}</span>,
  },
  {
    key: "response",
    header: "Avg Response",
    align: "right",
    cell: (row) => <span className="tabular-nums">{formatResponseTime(row.avg_response_hours)}</span>,
  },
];

/** Admin performance (app.md §11/§35). Rows drill into /admins/[id]. */
export async function AdminPerformanceTable({ className }: { className?: string }) {
  const result = await getAdminPerformance();
  if (!result.ok) return <WidgetError title="Admin performance" message={result.error} className={className} />;
  const rows = result.data.filter((row) => row.status === "active" || row.requests_assigned > 0);

  return (
    <SectionCard
      title="Admin Performance"
      description="Material request workload and turnaround per admin"
      className={className}
      action={
        <Link href="/reports?tab=admins" className={viewAllClass}>
          Full report
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      }
    >
      <DataTable
        bare
        columns={ADMIN_COLUMNS}
        rows={rows}
        getRowId={(row) => row.user_id}
        getRowHref={(row) => `/admins/${row.user_id}`}
        getRowLabel={(row) => `Open admin ${row.full_name}`}
        caption="Admin performance"
        emptyState={
          <EmptyState
            compact
            icon={ShieldCheck}
            title="No admins yet"
            description="Add admins from Users so material requests can be reviewed and tracked."
          />
        }
      />
    </SectionCard>
  );
}
