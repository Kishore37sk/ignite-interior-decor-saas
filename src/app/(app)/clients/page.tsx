import { Plus, SearchX, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CurrencyText } from "@/components/shared/currency-text";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { DeadlineBadge } from "@/components/shared/deadline-badge";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressBar } from "@/components/shared/progress-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { formatINR, pluralize } from "@/lib/format";
import type { SearchParamsRecord } from "@/lib/search-params";
import { listClients, type ClientCostSummary } from "@/features/clients/queries";
import { deadlineFromDays } from "@/features/projects/constants";
import { listTeamOptions } from "@/features/projects/queries";
import type { ClientDirectoryRow } from "@/types/database";

export const metadata: Metadata = { title: "Clients" };

type PageProps = { searchParams: Promise<SearchParamsRecord> };

export default async function ClientsPage({ searchParams }: PageProps) {
  const user = await requireRole("owner", "site_manager");
  const params = await searchParams;
  const isOwner = user.role === "owner";

  const [{ filters, rows, total, costs }, siteManagers] = await Promise.all([
    listClients(params, user),
    isOwner ? listTeamOptions(["site_manager"]) : Promise.resolve([]),
  ]);

  const hasFilters = Boolean(filters.q || filters.projectStatus || filters.sm || filters.status !== "active");

  const columns: DataTableColumn<ClientDirectoryRow>[] = [
    {
      key: "client",
      header: "Client",
      sortable: true,
      sortKey: "name",
      mobile: "title",
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold text-text">{row.name}</span>
            {row.archived_at ? (
              <Badge tone="muted" size="sm">
                Archived
              </Badge>
            ) : null}
          </span>
          <span className="text-xs text-muted">
            {row.client_code}
            {row.city ? ` · ${row.city}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "project",
      header: "Project",
      sortable: true,
      mobile: "subtitle",
      cell: (row) =>
        row.latest_project_name ? (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-text">{row.latest_project_name}</span>
            {row.project_count > 1 ? (
              <span className="text-xs text-muted">{`+${row.project_count - 1} more · ${pluralize(row.project_count, "project")}`}</span>
            ) : null}
          </div>
        ) : (
          <span className="text-muted">No projects yet</span>
        ),
    },
    ...(isOwner
      ? [
          {
            key: "cost",
            header: "Project Cost",
            align: "right" as const,
            cell: (row: ClientDirectoryRow) => <CostCell summary={costs?.get(row.id)} />,
          },
        ]
      : []),
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (row) =>
        row.latest_project_status ? (
          <StatusBadge kind="project" value={row.latest_project_status} size="sm" />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "progress",
      header: "Progress",
      sortable: true,
      className: "min-w-36",
      cell: (row) =>
        row.latest_progress !== null ? (
          <ProgressBar value={row.latest_progress} label={`${row.name} project progress`} size="sm" />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "sm",
      header: "Site Manager",
      hideBelowLg: true,
      cell: (row) =>
        row.site_manager_name ? (
          <span className="text-text">{row.site_manager_name}</span>
        ) : row.latest_project_id ? (
          <span className="text-warning-text">Not assigned</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "start_date",
      header: "Start Date",
      sortable: true,
      hideBelowLg: true,
      cell: (row) => <span className="tabular-nums">{formatDate(row.latest_start_date)}</span>,
    },
    {
      key: "handover_date",
      header: "Handover Date",
      sortable: true,
      cell: (row) => <span className="tabular-nums">{formatDate(row.latest_handover_date)}</span>,
    },
    {
      key: "days_remaining",
      header: "Days Remaining",
      sortable: true,
      cell: (row) =>
        row.latest_project_status ? (
          <DeadlineBadge
            deadline={deadlineFromDays(row.latest_days_remaining)}
            status={row.latest_project_status}
            size="sm"
          />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clients"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Clients" }]}
        description={
          isOwner
            ? "Every client with their latest project, deadline and site manager."
            : "Clients of the projects you are assigned to."
        }
        actions={
          isOwner ? (
            <Button asChild>
              <Link href="/clients/new">
                <Plus aria-hidden="true" />
                Add Client
              </Link>
            </Button>
          ) : null
        }
      />

      <DataTable
        title="Client List"
        caption="Clients"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        getRowHref={(row) => `/clients/${row.id}`}
        getRowLabel={(row) => `Open client ${row.name} (${row.client_code})`}
        sort={{ key: filters.sort, dir: filters.dir }}
        pagination={{ total, page: filters.page, pageSize: filters.pageSize, itemLabel: "clients" }}
        toolbar={
          <FilterBar
            searchPlaceholder="Search name, code, phone, city…"
            filters={[
              {
                param: "status",
                label: "Client status",
                allLabel: "Active clients",
                options: [
                  { value: "archived", label: "Archived clients" },
                  { value: "all", label: "All clients" },
                ],
              },
              {
                param: "project_status",
                label: "Project status",
                allLabel: "Any project status",
                options: PROJECT_STATUSES.map((value) => ({ value, label: PROJECT_STATUS_LABELS[value] })),
              },
              ...(isOwner
                ? [
                    {
                      param: "sm",
                      label: "Site manager",
                      allLabel: "All site managers",
                      options: siteManagers.map((sm) => ({
                        value: sm.id,
                        label: sm.employee_id ? `${sm.full_name} (${sm.employee_id})` : sm.full_name,
                      })),
                    },
                  ]
                : []),
            ]}
          />
        }
        emptyState={
          hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="No clients match these filters"
              description="Try a different search term or clear the filters."
            />
          ) : (
            <EmptyState
              icon={Users}
              title={isOwner ? "No clients yet" : "No clients assigned"}
              description={
                isOwner
                  ? "Add your first client, then create a project for them to start tracking deadlines and materials."
                  : "Clients appear here once the owner assigns you to one of their projects."
              }
              action={
                isOwner ? (
                  <Button asChild>
                    <Link href="/clients/new">
                      <Plus aria-hidden="true" />
                      Add Client
                    </Link>
                  </Button>
                ) : null
              }
            />
          )
        }
      />
    </div>
  );
}

function CostCell({ summary }: { summary: ClientCostSummary | undefined }) {
  if (!summary) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-col md:items-end">
      <CurrencyText value={summary.latestProjectCost} className="font-medium text-text" />
      {summary.projectCount > 1 ? (
        <span className="text-xs text-muted">{`${formatINR(summary.totalCost, { compact: true })} all projects`}</span>
      ) : null}
    </div>
  );
}
