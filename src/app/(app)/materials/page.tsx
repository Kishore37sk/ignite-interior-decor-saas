import { Boxes, ChevronDown, Package, PackageSearch, Plus, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CurrencyText } from "@/components/shared/currency-text";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { LinkTabs } from "@/components/ui/tabs";
import { requireRole, type CurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatNumber, formatQuantity } from "@/lib/format";
import { buildHref, parseEnumParam, type SearchParamsRecord } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { AddMaterialButton, CatalogRowActions } from "@/features/materials/components/catalog-actions";
import {
  MATERIALS_TABS,
  REQUIREMENT_STATUS_FILTERS,
  REQUIREMENT_STATUS_FILTER_LABELS,
} from "@/features/materials/constants";
import {
  listCatalog,
  listCategoryNames,
  listProjectOptions,
  listRequirements,
  type ProjectRequirements,
} from "@/features/materials/queries";
import type { Material } from "@/types/database";

export const metadata: Metadata = { title: "Materials" };

type PageProps = { searchParams: Promise<SearchParamsRecord> };

export default async function MaterialsPage({ searchParams }: PageProps) {
  const user = await requireRole("owner", "admin", "site_manager");
  const params = await searchParams;
  const tab = parseEnumParam(params, "tab", MATERIALS_TABS) ?? "requirements";
  const canManageCatalog = user.role === "owner" || user.role === "admin";

  const categories = await listCategoryNames();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Materials"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Materials" }]}
        description={
          tab === "catalog"
            ? "The materials catalog used to raise requests quickly."
            : "What each project needs, what it costs, what has arrived and what is still pending."
        }
        actions={
          tab === "catalog" && canManageCatalog ? (
            <AddMaterialButton categories={categories} />
          ) : user.role !== "admin" ? (
            <Button asChild>
              <Link href="/material-requests/new">
                <Plus aria-hidden="true" />
                New Request
              </Link>
            </Button>
          ) : null
        }
      />
      <LinkTabs
        label="Materials sections"
        active={tab}
        items={[
          { value: "requirements", label: "Project requirements", href: "/materials" },
          { value: "catalog", label: "Catalog", href: "/materials?tab=catalog" },
        ]}
      />
      {tab === "catalog" ? (
        <CatalogTab params={params} categories={categories} canManage={canManageCatalog} />
      ) : (
        <RequirementsTab params={params} user={user} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Requirements                                                               */
/* -------------------------------------------------------------------------- */

async function RequirementsTab({ params, user }: { params: SearchParamsRecord; user: CurrentUser }) {
  const [{ filters, projects, total, outOfRange }, projectOptions] = await Promise.all([listRequirements(params), listProjectOptions()]);
  const showCosts = user.role !== "site_manager";
  const hasFilters = Boolean(filters.q || filters.project || filters.status);

  return (
    <div className="flex flex-col gap-4">
      <div className="card-surface p-4 sm:p-5">
        <FilterBar
          searchPlaceholder="Search project, code or client…"
          filters={[
            {
              param: "project",
              label: "Project",
              allLabel: "All projects",
              options: projectOptions.map((p) => ({ value: p.id, label: `${p.name} (${p.project_code})` })),
            },
            {
              param: "status",
              label: "Status",
              allLabel: "All statuses",
              options: REQUIREMENT_STATUS_FILTERS.map((value) => ({ value, label: REQUIREMENT_STATUS_FILTER_LABELS[value] })),
            },
          ]}
        />
      </div>

      {projects.length === 0 ? (
        <div className="card-surface">
          {outOfRange ? (
            <EmptyState
              icon={SearchX}
              title="This page is empty"
              description="There are fewer projects than this page number."
              action={
                <Button asChild variant="outline">
                  <Link href={buildHref("/materials", params, { page: null })}>Go to the first page</Link>
                </Button>
              }
            />
          ) : hasFilters ? (
            <EmptyState icon={SearchX} title="No requirements match these filters" description="Try a different project or status, or clear the filters." />
          ) : (
            <EmptyState
              icon={PackageSearch}
              title="No material requirements yet"
              description="Once material requests are raised for a project, its requirements and costs are summarised here."
              action={
                user.role !== "admin" ? (
                  <Button asChild>
                    <Link href="/material-requests/new">
                      <Plus aria-hidden="true" />
                      New Request
                    </Link>
                  </Button>
                ) : null
              }
            />
          )}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-4" aria-label="Project material requirements">
            {projects.map((entry) => (
              <li key={entry.project.id}>
                <ProjectRequirementCard entry={entry} showCosts={showCosts} statusFiltered={Boolean(filters.status)} />
              </li>
            ))}
          </ul>
          <div className="card-surface p-4">
            <Pagination total={total} page={filters.page} pageSize={filters.pageSize} pageSizeOptions={[10, 20, 50]} itemLabel="projects" />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: "warning" | "success" }) {
  const body = (
    <>
      <span className="text-xs text-muted">{label}</span>
      <span
        className={cn(
          "text-xl font-semibold tabular-nums",
          tone === "warning" && value > 0 ? "text-warning-text" : tone === "success" && value > 0 ? "text-success-text" : "text-text",
        )}
      >
        {formatNumber(value, 0)}
      </span>
    </>
  );
  const boxClass = "flex min-w-0 flex-col rounded-xl bg-surface-muted px-3 py-2";
  // Without a matching list filter the figure is shown as plain text, never as a misleading link.
  if (!href) return <div className={boxClass}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(
        boxClass,
        "transition-colors hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      )}
    >
      {body}
    </Link>
  );
}

function ProjectRequirementCard({
  entry,
  showCosts,
  statusFiltered,
}: {
  entry: ProjectRequirements;
  showCosts: boolean;
  statusFiltered: boolean;
}) {
  const { project, summary, lines } = entry;
  const base = `/material-requests?project=${project.id}`;
  const pendingLines = lines.filter((l) => l.status !== "delivered" && l.status !== "rejected" && l.status !== "cancelled").length;
  const actual = Number(summary?.actual_material_cost ?? 0);
  const approved = Number(summary?.approved_material_cost ?? 0);

  return (
    <article className="card-surface flex flex-col gap-4 p-5 sm:p-6" aria-labelledby={`req-${project.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`req-${project.id}`} className="text-lg font-semibold tracking-tight text-text">
            <Link href={`/projects/${project.id}?tab=materials`} className="hover:text-primary-strong hover:underline">
              {project.name}
            </Link>
          </h2>
          <p className="text-sm text-muted">
            {project.project_code} · {project.client_name}
            {project.site_manager_name ? ` · ${project.site_manager_name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project.archived_at ? (
            <Badge tone="muted" size="sm">
              Archived
            </Badge>
          ) : null}
          <StatusBadge kind="project" value={project.status} size="sm" />
        </div>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Total requests" value={summary.total_requests} href={base} />
          <Stat label="Pending" value={summary.pending_requests} href={`${base}&view=pending`} tone="warning" />
          <Stat label="Approved" value={summary.approved_requests} href={`${base}&status=approved`} />
          {/* ordered_requests counts ordered + partially delivered; no single list filter matches both. */}
          <Stat label="Ordered / part-delivered" value={summary.ordered_requests} />
          <Stat label="Delivered" value={summary.delivered_requests} href={`${base}&view=completed`} tone="success" />
        </div>
      ) : null}

      {showCosts && summary ? (
        <dl className="grid grid-cols-1 gap-3 rounded-2xl bg-soft px-4 py-3 text-sm sm:grid-cols-3">
          <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start">
            <dt className="text-xs text-deep/80">Pending material cost</dt>
            <dd className="font-semibold text-deep">
              <CurrencyText value={summary.pending_material_cost} />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start">
            <dt className="text-xs text-deep/80">Approved material cost</dt>
            <dd className="font-semibold text-deep">
              <CurrencyText value={summary.approved_material_cost} />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start">
            <dt className="text-xs text-deep/80">Actual material cost</dt>
            <dd className={cn("font-semibold", actual > approved && approved > 0 ? "text-danger-text" : "text-deep")}>
              <CurrencyText value={summary.actual_material_cost} className={actual > approved && approved > 0 ? "text-danger-text" : undefined} />
            </dd>
          </div>
        </dl>
      ) : null}

      <details className="group rounded-2xl border border-border-soft" open={lines.length > 0 && lines.length <= 6}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-text hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <Boxes aria-hidden="true" className="size-4 text-primary-strong" />
            {statusFiltered ? "Matching items" : "Required items"} ({lines.length})
            {!statusFiltered && pendingLines > 0 ? (
              <span className="font-normal text-muted">· {pendingLines} still open</span>
            ) : null}
          </span>
          <ChevronDown aria-hidden="true" className="size-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        {lines.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted">No items to show.</p>
        ) : (
          <ul className="divide-y divide-border-soft border-t border-border-soft">
            {lines.map((line) => (
              <li key={line.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-6">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{line.materialName}</p>
                  <p className="truncate text-xs text-muted">
                    {line.category ? `${line.category} · ` : ""}
                    <Link href={`/material-requests/${line.requestId}`} className="text-primary-strong hover:underline">
                      {line.requestCode}
                    </Link>
                    {` · needed ${formatDate(line.requiredDate)}`}
                  </p>
                </div>
                <p className="text-right text-sm tabular-nums text-text sm:text-left">
                  {formatQuantity(line.quantity, line.unit)}
                  {line.deliveredQuantity > 0 && line.deliveredQuantity < line.quantity ? (
                    <span className="block text-xs text-muted">{formatQuantity(line.deliveredQuantity, line.unit)} delivered</span>
                  ) : null}
                </p>
                <span className="col-span-2 sm:col-span-1 sm:justify-self-end">
                  <StatusBadge kind="material" value={line.status} size="sm" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Catalog                                                                    */
/* -------------------------------------------------------------------------- */

async function CatalogTab({
  params,
  categories,
  canManage,
}: {
  params: SearchParamsRecord;
  categories: readonly string[];
  canManage: boolean;
}) {
  const { filters, rows, total, outOfRange } = await listCatalog(params);
  const hasFilters = Boolean(filters.q || filters.category || filters.active);
  const categoryOptions = Array.from(new Set([...categories, ...(filters.category ? [filters.category] : [])]));

  const columns: DataTableColumn<Material>[] = [
    {
      key: "name",
      header: "Material",
      sortable: true,
      mobile: "title",
      cell: (row) => <span className="font-semibold text-text">{row.name}</span>,
    },
    { key: "category", header: "Category", sortable: true, mobile: "subtitle", cell: (row) => row.category ?? <span className="text-muted">—</span> },
    { key: "unit", header: "Unit", sortable: true, cell: (row) => row.unit },
    {
      key: "description",
      header: "Description",
      hideBelowLg: true,
      cell: (row) =>
        row.description ? <span className="line-clamp-2 max-w-80 text-sm text-muted">{row.description}</span> : <span className="text-muted">—</span>,
    },
    {
      key: "active",
      header: "Status",
      cell: (row) =>
        row.is_active ? (
          <Badge tone="success" size="sm">
            Active
          </Badge>
        ) : (
          <Badge tone="muted" size="sm">
            Inactive
          </Badge>
        ),
    },
  ];
  if (canManage) {
    columns.push({
      key: "actions",
      header: "Actions",
      align: "right",
      interactive: true,
      cell: (row) => (
        <div className="flex md:justify-end">
          <CatalogRowActions
            item={{ id: row.id, name: row.name, category: row.category, unit: row.unit, description: row.description, is_active: row.is_active }}
            categories={categories}
          />
        </div>
      ),
    });
  }

  return (
    <DataTable
      title="Materials catalog"
      caption="Materials catalog"
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      sort={{ key: filters.sort, dir: filters.dir }}
      pagination={{ total, page: filters.page, pageSize: filters.pageSize, itemLabel: "materials" }}
      toolbar={
        <FilterBar
          searchPlaceholder="Search materials…"
          filters={[
            { param: "category", label: "Category", allLabel: "All categories", options: categoryOptions.map((c) => ({ value: c, label: c })) },
            {
              param: "active",
              label: "Status",
              allLabel: "Active & inactive",
              options: [
                { value: "active", label: "Active only" },
                { value: "inactive", label: "Inactive only" },
              ],
            },
          ]}
        />
      }
      emptyState={
        outOfRange ? (
          <EmptyState
            icon={SearchX}
            title="This page is empty"
            description="There are fewer materials than this page number."
            action={
              <Button asChild variant="outline">
                <Link href={buildHref("/materials", params, { page: null })}>Go to the first page</Link>
              </Button>
            }
          />
        ) : hasFilters ? (
          <EmptyState icon={SearchX} title="No materials match these filters" description="Try a different search or clear the filters." />
        ) : (
          <EmptyState
            icon={Package}
            title="The catalog is empty"
            description={
              canManage
                ? "Add frequently used materials so site managers can pick them in a tap."
                : "The admin team hasn't added catalog materials yet. You can still type any material when raising a request."
            }
            action={canManage ? <AddMaterialButton categories={categories} /> : null}
          />
        )
      }
    />
  );
}
