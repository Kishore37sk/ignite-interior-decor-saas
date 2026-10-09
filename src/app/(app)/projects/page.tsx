import { FolderKanban, FolderPlus, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CurrencyText } from "@/components/shared/currency-text";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { DeadlineBadge } from "@/components/shared/deadline-badge";
import { FilterBar, type FilterSelect } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressBar } from "@/components/shared/progress-bar";
import { ProjectCard } from "@/components/shared/project-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { LinkTabs } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import { PRIORITY_LABELS, PRIORITY_LEVELS, PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { buildHref, type SearchParamsRecord } from "@/lib/search-params";
import { listActiveClientOptions } from "@/features/clients/queries";
import { PROJECT_VIEWS, PROJECT_VIEW_LABELS } from "@/features/projects/constants";
import { listProjects, listTeamOptions, type ProjectMaterialCost } from "@/features/projects/queries";
import type { ProjectDirectoryRow } from "@/types/database";

export const metadata: Metadata = { title: "Projects" };

type PageProps = { searchParams: Promise<SearchParamsRecord> };

export default async function ProjectsPage({ searchParams }: PageProps) {
  const user = await requireRole("owner", "admin", "site_manager");
  const params = await searchParams;
  const isOwner = user.role === "owner";
  const isSiteManager = user.role === "site_manager";

  const [{ filters, rows, total, materialCosts }, siteManagers, clients] = await Promise.all([
    listProjects(params, user),
    isSiteManager ? Promise.resolve([]) : listTeamOptions(["site_manager"]),
    isOwner ? listActiveClientOptions() : Promise.resolve([]),
  ]);

  const hasFilters = Boolean(
    filters.q ||
      filters.view ||
      filters.status ||
      filters.sm ||
      filters.priority ||
      filters.client ||
      filters.archived ||
      filters.range.from ||
      filters.range.to,
  );

  const viewTabs = [
    { value: "all", label: "All", href: buildHref("/projects", params, { view: null }) },
    ...PROJECT_VIEWS.map((view) => ({
      value: view,
      label: PROJECT_VIEW_LABELS[view],
      href: buildHref("/projects", params, { view }),
    })),
  ];

  const filterSelects: FilterSelect[] = [
    {
      param: "status",
      label: "Status",
      allLabel: "All statuses",
      options: PROJECT_STATUSES.map((value) => ({ value, label: PROJECT_STATUS_LABELS[value] })),
    },
    {
      param: "priority",
      label: "Priority",
      allLabel: "All priorities",
      options: PRIORITY_LEVELS.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
    },
  ];
  if (!isSiteManager) {
    filterSelects.push({
      param: "sm",
      label: "Site manager",
      allLabel: "All site managers",
      options: siteManagers.map((sm) => ({
        value: sm.id,
        label: sm.employee_id ? `${sm.full_name} (${sm.employee_id})` : sm.full_name,
      })),
    });
  }
  if (isOwner) {
    filterSelects.push(
      {
        param: "client",
        label: "Client",
        allLabel: "All clients",
        options: clients.map((c) => ({ value: c.id, label: `${c.name} (${c.client_code})` })),
      },
      {
        param: "archived",
        label: "Archived",
        allLabel: "Active projects",
        options: [
          { value: "only", label: "Archived only" },
          { value: "include", label: "Include archived" },
        ],
      },
    );
  }

  const toolbar = (
    <FilterBar
      searchPlaceholder="Search project, code, client, city…"
      filters={filterSelects}
      dateRange={{ label: "Expected completion", anyLabel: "Any completion date" }}
      extraParams={["view", "client", "sm"]}
    />
  );

  const emptyState = hasFilters ? (
    <EmptyState
      icon={SearchX}
      title="No projects match these filters"
      description="Try another view, a different search term, or clear the filters."
    />
  ) : (
    <EmptyState
      icon={FolderKanban}
      title={isSiteManager ? "No projects assigned yet" : isOwner ? "No projects yet" : "No projects to show"}
      description={
        isSiteManager
          ? "When the owner assigns you to a project it will appear here."
          : isOwner
            ? "Create a project for a client to start tracking progress, deadlines and materials."
            : "Projects appear here when material requests from them are assigned to you or unassigned."
      }
      action={
        isOwner ? (
          <Button asChild>
            <Link href="/projects/new">
              <FolderPlus aria-hidden="true" />
              New Project
            </Link>
          </Button>
        ) : null
      }
    />
  );

  const header = (
    <PageHeader
      title={isSiteManager ? "My Projects" : "Projects"}
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: isSiteManager ? "My Projects" : "Projects" }]}
      description={
        isSiteManager
          ? "Projects you are assigned to. Tap a project to post an update or request materials."
          : "Track status, progress and handover deadlines across every project."
      }
      actions={
        isOwner ? (
          <Button asChild>
            <Link href="/projects/new">
              <FolderPlus aria-hidden="true" />
              New Project
            </Link>
          </Button>
        ) : null
      }
    />
  );

  const tabs = <LinkTabs label="Project views" items={viewTabs} active={filters.view ?? "all"} />;

  if (isSiteManager) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {tabs}
        <div className="card-surface p-4 sm:p-5">{toolbar}</div>
        {rows.length === 0 ? (
          <div className="card-surface">{emptyState}</div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="My projects">
            {rows.map((project) => (
              <li key={project.id} className="min-w-0">
                <ProjectCard project={project} hideSiteManager className="h-full" />
              </li>
            ))}
          </ul>
        )}
        {total > 0 ? (
          <div className="card-surface p-4">
            <Pagination
              total={total}
              page={filters.page}
              pageSize={filters.pageSize}
              pageSizeOptions={[12, 24, 48]}
              itemLabel="projects"
            />
          </div>
        ) : null}
      </div>
    );
  }

  const columns: DataTableColumn<ProjectDirectoryRow>[] = [
    {
      key: "name",
      header: "Project",
      sortable: true,
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
            {row.project_code}
            {row.city ? ` · ${row.city}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "client",
      header: "Client",
      sortable: true,
      mobile: "subtitle",
      interactive: isOwner,
      cell: (row) =>
        isOwner ? (
          <Link href={`/clients/${row.client_id}`} className="text-text hover:text-primary-strong hover:underline">
            {row.client_name}
          </Link>
        ) : (
          <span className="text-text">{row.client_name}</span>
        ),
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
      className: "min-w-36",
      cell: (row) => (
        <ProgressBar value={row.progress_percentage} label={`${row.name} progress`} state={row.deadline_state} size="sm" />
      ),
    },
    {
      key: "sm",
      header: "Site Manager",
      hideBelowLg: true,
      cell: (row) =>
        row.site_manager_name ? (
          <span className="text-text">{row.site_manager_name}</span>
        ) : (
          <span className="text-warning-text">Not assigned</span>
        ),
    },
    {
      key: "start_date",
      header: "Start",
      sortable: true,
      hideBelowLg: true,
      cell: (row) => <span className="tabular-nums">{formatDate(row.start_date)}</span>,
    },
    {
      key: "expected_completion_date",
      header: "Expected Completion",
      sortable: true,
      cell: (row) => <span className="tabular-nums">{formatDate(row.expected_completion_date)}</span>,
    },
    {
      key: "handover_date",
      header: "Handover",
      sortable: true,
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <span className="tabular-nums">{formatDate(row.handover_date)}</span>
          <DeadlineBadge deadline={row.deadline_date} status={row.status} size="sm" />
        </div>
      ),
    },
    ...(isOwner
      ? [
          {
            key: "material_cost",
            header: "Material Cost",
            align: "right" as const,
            cell: (row: ProjectDirectoryRow) => <MaterialCostCell cost={materialCosts?.get(row.id)} />,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      {header}
      {tabs}
      <DataTable
        title="Project List"
        caption="Projects"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        getRowHref={(row) => `/projects/${row.id}`}
        getRowLabel={(row) => `Open project ${row.name} (${row.project_code})`}
        sort={{ key: filters.sort, dir: filters.dir }}
        pagination={{ total, page: filters.page, pageSize: filters.pageSize, itemLabel: "projects" }}
        toolbar={toolbar}
        emptyState={emptyState}
      />
    </div>
  );
}

function MaterialCostCell({ cost }: { cost: ProjectMaterialCost | undefined }) {
  if (!cost) return <span className="text-muted">—</span>;
  const overrun = cost.actual > 0 && cost.variance > 0;
  return (
    <div className="flex flex-col md:items-end">
      <CurrencyText value={cost.actual > 0 ? cost.actual : cost.estimated} className="font-medium text-text" />
      <span className={overrun ? "text-xs font-medium text-danger-text" : "text-xs text-muted"}>
        {cost.actual > 0 ? (overrun ? "Actual · over estimate" : "Actual") : "Estimated"}
      </span>
    </div>
  );
}
