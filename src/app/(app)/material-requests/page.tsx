import { ClipboardList, Plus, SearchX, UserRound, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CurrencyText } from "@/components/shared/currency-text";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { FilterBar, type FilterSelect } from "@/components/shared/filter-bar";
import { MaterialRequestCard } from "@/components/shared/material-request-card";
import { PageHeader } from "@/components/shared/page-header";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { RequiredDateBadge } from "@/components/shared/required-date-badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { LinkTabs } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import {
  MATERIAL_OPEN_STATUSES,
  MATERIAL_REQUEST_STATUSES,
  MATERIAL_REQUEST_STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_LEVELS,
} from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { buildHref, parseUuidParam, type SearchParamsRecord } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { ClaimButton } from "@/features/materials/components/claim-button";
import { REQUEST_VIEWS, REQUEST_VIEW_LABELS } from "@/features/materials/constants";
import {
  getClientFilterLabel,
  listMaterialRequests,
  listPeople,
  listProjectOptions,
} from "@/features/materials/queries";
import type { MaterialRequestDirectoryRow, MaterialRequestStatus } from "@/types/database";

export const metadata: Metadata = { title: "Material Requests" };

type PageProps = { searchParams: Promise<SearchParamsRecord> };

const OPEN = new Set<MaterialRequestStatus>(MATERIAL_OPEN_STATUSES);

export default async function MaterialRequestsPage({ searchParams }: PageProps) {
  const user = await requireRole("owner", "admin", "site_manager");
  const params = await searchParams;
  const isOwner = user.role === "owner";
  const isAdmin = user.role === "admin";
  const isSiteManager = user.role === "site_manager";
  const canCreate = isOwner || isSiteManager;

  const clientFilter = parseUuidParam(params, "client");
  const [{ filters, rows, total }, admins, siteManagers, projects, clientLabel] = await Promise.all([
    listMaterialRequests(params, user),
    isSiteManager ? Promise.resolve([]) : listPeople("admin"),
    isSiteManager ? Promise.resolve([]) : listPeople("site_manager"),
    listProjectOptions(),
    clientFilter ? getClientFilterLabel(clientFilter) : Promise.resolve(null),
  ]);
  const clientName = filters.client ? (clientLabel ?? rows[0]?.client_name ?? "Selected client") : null;

  const hasFilters = Boolean(
    filters.q ||
      filters.view ||
      filters.status ||
      filters.priority ||
      filters.admin ||
      filters.sm ||
      filters.project ||
      filters.client ||
      filters.range.from ||
      filters.range.to,
  );

  const viewTabs = [
    { value: "all", label: "All", href: buildHref("/material-requests", params, { view: null }) },
    ...REQUEST_VIEWS.filter((view) => !(isSiteManager && view === "unassigned")).map((view) => ({
      value: view,
      label: view === "mine" ? (isAdmin ? "Assigned to me" : "Raised by me") : REQUEST_VIEW_LABELS[view],
      href: buildHref("/material-requests", params, { view }),
    })),
  ];

  const filterSelects: FilterSelect[] = [
    {
      param: "status",
      label: "Status",
      allLabel: "All statuses",
      options: MATERIAL_REQUEST_STATUSES.map((value) => ({ value, label: MATERIAL_REQUEST_STATUS_LABELS[value] })),
    },
    {
      param: "priority",
      label: "Priority",
      allLabel: "All priorities",
      options: PRIORITY_LEVELS.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
    },
    {
      param: "project",
      label: "Project",
      allLabel: "All projects",
      options: projects.map((p) => ({ value: p.id, label: `${p.name} (${p.project_code})` })),
    },
  ];
  if (!isSiteManager) {
    filterSelects.push(
      {
        param: "admin",
        label: "Admin",
        allLabel: "All admins",
        options: admins.map((a) => ({ value: a.id, label: a.employee_id ? `${a.full_name} (${a.employee_id})` : a.full_name })),
      },
      {
        param: "sm",
        label: "Site manager",
        allLabel: "All site managers",
        options: siteManagers.map((s) => ({ value: s.id, label: s.employee_id ? `${s.full_name} (${s.employee_id})` : s.full_name })),
      },
    );
  }

  const toolbar = (
    <FilterBar
      searchPlaceholder="Search code, material, project…"
      filters={filterSelects}
      dateRange={{ label: "Required date", anyLabel: "Any required date" }}
      extraParams={["view", "client", "sort", "dir"]}
    >
      {clientName ? (
        <span className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border border-primary/40 bg-soft/60 pl-3 pr-1 text-sm text-deep">
          <UserRound aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">
            Client: <span className="font-semibold">{clientName}</span>
          </span>
          <Link
            href={buildHref("/material-requests", params, { client: null, page: null })}
            aria-label={`Clear client filter (${clientName})`}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-deep transition-colors hover:bg-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X aria-hidden="true" className="size-4" />
          </Link>
        </span>
      ) : null}
    </FilterBar>
  );

  const emptyState = total > 0 ? (
    <EmptyState
      icon={SearchX}
      title="This page is empty"
      description="There are fewer requests than this page number."
      action={
        <Button asChild variant="outline">
          <Link href={buildHref("/material-requests", params, { page: null })}>Go to the first page</Link>
        </Button>
      }
    />
  ) : hasFilters ? (
    <EmptyState
      icon={SearchX}
      title="No requests match these filters"
      description="Try another view, a different search term, or clear the filters."
    />
  ) : (
    <EmptyState
      icon={ClipboardList}
      title="No material requests yet"
      description={
        isSiteManager
          ? "Raise a request when your site needs cement, tiles, wiring or anything else — the admin team is notified instantly."
          : isAdmin
            ? "Requests from site managers appear here when they're assigned to you or waiting to be picked up."
            : "Site managers raise material requests from their projects. You can also raise one yourself."
      }
      action={
        canCreate ? (
          <Button asChild>
            <Link href="/material-requests/new">
              <Plus aria-hidden="true" />
              New Request
            </Link>
          </Button>
        ) : null
      }
    />
  );

  const columns = buildColumns(user.role, user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Material Requests"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Material Requests" }]}
        description={
          isSiteManager
            ? "Requests raised for your projects, most urgent first."
            : isAdmin
              ? "Review, order and deliver materials. Urgent and overdue requests are listed first."
              : "Every material request across projects, with costs and who is handling it."
        }
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/material-requests/new">
                <Plus aria-hidden="true" />
                New Request
              </Link>
            </Button>
          ) : null
        }
      />
      <LinkTabs label="Request views" items={viewTabs} active={filters.view ?? "all"} />

      <div className="card-surface p-4 sm:p-5">{toolbar}</div>

      {rows.length === 0 ? (
        <div className="card-surface">{emptyState}</div>
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable
              title={`${total} ${total === 1 ? "request" : "requests"}`}
              caption="Material requests"
              columns={columns}
              rows={rows}
              getRowId={(row) => row.id}
              getRowHref={(row) => `/material-requests/${row.id}`}
              getRowLabel={(row) => `Open request ${row.request_code}: ${row.title}`}
              sort={filters.sort === "urgency" ? undefined : { key: filters.sort, dir: filters.dir }}
              pagination={{ total, page: filters.page, pageSize: filters.pageSize, itemLabel: "requests" }}
            />
          </div>
          <div className="flex flex-col gap-3 md:hidden">
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Material requests">
              {rows.map((row) => (
                <li key={row.id} className="flex min-w-0 flex-col gap-2">
                  <MaterialRequestCard request={row} showCost={isOwner} className="h-full" />
                  {isAdmin && row.assigned_admin === null && OPEN.has(row.status) ? (
                    <ClaimButton requestId={row.id} requestCode={row.request_code} size="md" className="w-full" />
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="card-surface p-4">
              <Pagination total={total} page={filters.page} pageSize={filters.pageSize} itemLabel="requests" hidePageSize />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RequestCell({ row }: { row: MaterialRequestDirectoryRow }) {
  return (
    <div className="flex min-w-0 max-w-64 flex-col">
      <span className="truncate font-semibold text-text">{row.title}</span>
      <span className="text-xs text-muted">{row.request_code}</span>
    </div>
  );
}

function buildColumns(role: string, userId: string): DataTableColumn<MaterialRequestDirectoryRow>[] {
  const isOwner = role === "owner";
  const isAdmin = role === "admin";
  const isSiteManager = role === "site_manager";

  const columns: DataTableColumn<MaterialRequestDirectoryRow>[] = [
    { key: "request", header: "Request", mobile: "title", cell: (row) => <RequestCell row={row} /> },
    {
      key: "project",
      header: "Project",
      mobile: "subtitle",
      cell: (row) => (
        <div className="flex min-w-0 max-w-48 flex-col">
          <span className="truncate text-text">{row.project_name}</span>
          <span className="text-xs text-muted">{row.project_code}</span>
        </div>
      ),
    },
  ];
  if (!isSiteManager) {
    columns.push({
      key: "client",
      header: "Client",
      hideBelowLg: true,
      cell: (row) => <span className="text-text">{row.client_name ?? "—"}</span>,
    });
  }
  columns.push(
    {
      key: "material",
      header: "Material",
      cell: (row) => (
        <span className="line-clamp-2 max-w-56 text-sm text-text" title={row.items_summary ?? undefined}>
          {row.items_summary || "—"}
        </span>
      ),
    },
    {
      key: "required_date",
      header: "Required Date",
      sortable: true,
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <span className="tabular-nums">{formatDate(row.required_date)}</span>
          <RequiredDateBadge requiredDate={row.required_date} status={row.status} size="sm" />
        </div>
      ),
    },
    { key: "priority", header: "Priority", sortable: true, cell: (row) => <PriorityBadge value={row.priority} size="sm" /> },
  );
  if (!isSiteManager) {
    columns.push({
      key: "requested_by",
      header: "Requested By",
      hideBelowLg: true,
      cell: (row) => <span className="text-text">{row.requested_by_name ?? "—"}</span>,
    });
  }
  columns.push({
    key: "admin",
    header: isAdmin ? "Assigned To" : "Admin",
    hideBelowLg: isOwner,
    cell: (row) =>
      row.assigned_admin_name ? (
        <span className={cn("text-text", row.assigned_admin === userId && "font-medium text-primary-strong")}>
          {row.assigned_admin === userId ? "You" : row.assigned_admin_name}
        </span>
      ) : (
        <span className="text-warning-text">Unassigned</span>
      ),
  });
  columns.push({ key: "status", header: "Status", sortable: true, cell: (row) => <StatusBadge kind="material" value={row.status} size="sm" /> });

  columns.push({
    key: "estimated_cost",
    header: isSiteManager ? "Est. Cost" : "Estimated Cost",
    sortable: true,
    align: "right",
    hideBelowLg: isAdmin,
    cell: (row) => <CurrencyText value={row.estimated_cost} />,
  });
  if (isOwner) {
    columns.push({
      key: "actual_cost",
      header: "Actual Cost",
      align: "right",
      cell: (row) => {
        // cost_variance compares actual with the estimate of the same (billed) items.
        const over = row.cost_variance !== null && Number(row.cost_variance) > 0;
        return (
          <div className="flex flex-col md:items-end">
            <CurrencyText value={row.actual_cost} className={over ? "font-semibold text-danger-text" : undefined} />
            {over ? (
              <span className="text-xs font-medium text-danger-text">
                +<CurrencyText value={Number(row.cost_variance)} className="text-danger-text" /> over
              </span>
            ) : null}
          </div>
        );
      },
    });
  }
  if (isAdmin) {
    columns.push({
      key: "action",
      header: "Action",
      interactive: true,
      cell: (row) =>
        row.assigned_admin === null && OPEN.has(row.status) ? (
          <ClaimButton requestId={row.id} requestCode={row.request_code} />
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href={`/material-requests/${row.id}`}>{OPEN.has(row.status) && row.assigned_admin === userId ? "Process" : "View"}</Link>
          </Button>
        ),
    });
  }
  return columns;
}
