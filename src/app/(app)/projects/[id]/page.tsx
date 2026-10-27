import { ClipboardPen, Lock, PackagePlus, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { DeadlineBadge } from "@/components/shared/deadline-badge";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkTabs } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import { isClosedProjectStatus } from "@/lib/constants";
import { formatDate, relativeTime } from "@/lib/dates";
import { getParam, parseEnumParam, parsePage, parsePageSize, type SearchParamsRecord } from "@/lib/search-params";
import { uuid } from "@/lib/validation/common";
import { PaymentsTab } from "@/features/payments/components/payments-tab";
import { canViewProjectFinancials } from "@/features/payments/queries";
import { ProjectArchiveButton } from "@/features/projects/components/project-archive-button";
import { ActivityTab } from "@/features/projects/components/tabs/activity-tab";
import { DocumentsTab } from "@/features/projects/components/tabs/documents-tab";
import { MaterialsTab } from "@/features/projects/components/tabs/materials-tab";
import { OverviewTab } from "@/features/projects/components/tabs/overview-tab";
import { RequestsTab } from "@/features/projects/components/tabs/requests-tab";
import { TimelineTab } from "@/features/projects/components/tabs/timeline-tab";
import { UpdatesTab } from "@/features/projects/components/tabs/updates-tab";
import {
  ACTIVITY_MAX_LIMIT,
  ACTIVITY_PAGE_SIZE,
  PROJECT_TABS,
  PROJECT_TAB_LABELS,
  UPDATES_PAGE_SIZE,
} from "@/features/projects/constants";
import { getProject, isActiveProjectMember } from "@/features/projects/queries";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<SearchParamsRecord> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { title: "Project" };
  try {
    const project = await getProject(parsed.data);
    return { title: project ? project.name : "Project" };
  } catch {
    return { title: "Project" };
  }
}

/** `?limit=` for "Load more" lists, clamped to [step, max] in multiples of `step`. */
function parseLimit(params: SearchParamsRecord, step: number, max: number): number {
  const raw = Number.parseInt(getParam(params, "limit") ?? "", 10);
  if (!Number.isFinite(raw) || raw < step) return step;
  return Math.min(Math.ceil(raw / step) * step, max);
}

export default async function ProjectDetailPage({ params, searchParams }: PageProps) {
  const user = await requireRole("owner", "admin", "site_manager");
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const id = uuid.safeParse(rawId);
  if (!id.success) notFound();

  const project = await getProject(id.data);
  if (!project) notFound();

  const isOwner = user.role === "owner";
  // Progress updates are visible only to the owner and project members (RLS): hide that tab
  // from admins who reach the project through a material request. Documents (Design & Floor
  // Map) are view/download only for everyone who can open the project (0010).
  // Payments: the owner and members the owner granted financial access.
  const [memberOnlyTabs, financeTab] = await Promise.all([
    user.role !== "admin" || isActiveProjectMember(project.id),
    isOwner || canViewProjectFinancials(project.id),
  ]);
  const visibleTabs = PROJECT_TABS.filter(
    (value) =>
      (memberOnlyTabs || value !== "updates") && (financeTab || value !== "payments"),
  );
  const requestedTab = parseEnumParam(query, "tab", PROJECT_TABS) ?? "overview";
  const tab = visibleTabs.includes(requestedTab) ? requestedTab : "overview";
  const isAssignedSm = user.role === "site_manager" && project.site_manager_ids.includes(user.id);
  const archived = Boolean(project.archived_at);
  const closed = isClosedProjectStatus(project.status) || archived;
  // Site managers are blocked by the RPCs / storage policies on closed or archived projects.
  const canWorkOnSite = isOwner || (isAssignedSm && !closed);
  const canRequestMaterials = (isOwner || isAssignedSm) && !closed;
  const closedReason = archived
    ? "This project is archived, so updates, uploads and new material requests are paused."
    : closed
      ? `This project is ${project.status === "completed" ? "completed" : "cancelled"}. Updates, uploads and new material requests are closed.`
      : null;

  const clientLink =
    isOwner || user.role === "site_manager" ? (
      <Link href={`/clients/${project.client_id}`} className="font-medium text-text hover:text-primary-strong hover:underline">
        {project.client_name}
      </Link>
    ) : (
      <span className="font-medium text-text">{project.client_name}</span>
    );

  const tabItems = visibleTabs.map((value) => ({
    value,
    label: PROJECT_TAB_LABELS[value],
    href: value === "overview" ? `/projects/${project.id}` : `/projects/${project.id}?tab=${value}`,
    count: value === "requests" ? project.total_material_requests : undefined,
  }));

  let content: ReactNode;
  switch (tab) {
    case "timeline":
      content = <TimelineTab projectId={project.id} canEdit={canWorkOnSite} lockedReason={isAssignedSm ? closedReason : null} />;
      break;
    case "updates":
      content = (
        <UpdatesTab
          projectId={project.id}
          user={user}
          limit={parseLimit(query, UPDATES_PAGE_SIZE, ACTIVITY_MAX_LIMIT)}
          step={UPDATES_PAGE_SIZE}
          canPostUpdate={canWorkOnSite}
        />
      );
      break;
    case "requests":
      content = (
        <RequestsTab
          projectId={project.id}
          page={parsePage(query)}
          pageSize={parsePageSize(query, 10)}
          showCosts={isOwner}
          canRequest={canRequestMaterials}
        />
      );
      break;
    case "materials":
      content = <MaterialsTab projectId={project.id} showCosts={isOwner} />;
      break;
    case "payments":
      content = <PaymentsTab project={project} canManage={isOwner} />;
      break;
    case "documents":
      content = (
        <DocumentsTab
          projectId={project.id}
          user={user}
          canUpload={canWorkOnSite}
          uploadNote={isAssignedSm ? closedReason : null}
        />
      );
      break;
    case "activity":
      content = (
        <ActivityTab
          projectId={project.id}
          limit={parseLimit(query, ACTIVITY_PAGE_SIZE, ACTIVITY_MAX_LIMIT)}
          step={ACTIVITY_PAGE_SIZE}
          maxLimit={ACTIVITY_MAX_LIMIT}
        />
      );
      break;
    default:
      content = <OverviewTab project={project} user={user} canPostUpdate={canWorkOnSite} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={project.name}
        meta={
          <>
            <Badge tone="outline">{project.project_code}</Badge>
            <StatusBadge kind="project" value={project.status} />
            <PriorityBadge value={project.priority} />
            {archived ? <Badge tone="muted">Archived</Badge> : null}
          </>
        }
        back={{ href: "/projects", label: user.role === "site_manager" ? "Back to my projects" : "Back to projects" }}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: user.role === "site_manager" ? "My Projects" : "Projects", href: "/projects" },
          { label: project.name },
        ]}
        actions={
          <>
            {isOwner ? <ProjectArchiveButton projectId={project.id} projectName={project.name} archived={archived} /> : null}
            {isOwner ? (
              <Button variant="outline" asChild>
                <Link href={`/projects/${project.id}/edit`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {canRequestMaterials ? (
              <Button variant="secondary" asChild>
                <Link href={`/material-requests/new?project=${project.id}`}>
                  <PackagePlus aria-hidden="true" />
                  New material request
                </Link>
              </Button>
            ) : null}
            {canWorkOnSite ? (
              <Button asChild>
                <Link href={`/projects/${project.id}/update`}>
                  <ClipboardPen aria-hidden="true" />
                  Update progress
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {closedReason && (isOwner || isAssignedSm) ? (
        <p role="status" className="flex items-start gap-2 rounded-2xl border border-border-soft bg-surface-muted px-4 py-3 text-sm text-muted">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            {closedReason}
            {isOwner ? " As the owner you can still edit the project or restore it." : " Ask the owner if more work is needed."}
          </span>
        </p>
      ) : null}

      <section aria-label="Project summary" className="card-surface grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Client</span>
          <span className="truncate">{clientLink}</span>
          <span className="text-xs text-muted">{project.client_code}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-medium text-muted">Progress</span>
          <ProgressBar value={project.progress_percentage} label="Project progress" showLabel state={project.deadline_state} />
          <span className="text-xs text-muted">
            {project.last_update_at ? `Last update ${relativeTime(project.last_update_at)}` : "No updates yet"}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Handover</span>
          <span className="font-semibold tabular-nums text-text">{formatDate(project.handover_date)}</span>
          <DeadlineBadge deadline={project.deadline_date} status={project.status} size="sm" className="w-fit" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Site manager</span>
          {project.site_manager_name ? (
            isOwner && project.site_manager_id ? (
              <Link href={`/site-managers/${project.site_manager_id}`} className="truncate font-medium text-text hover:text-primary-strong hover:underline">
                {project.site_manager_name}
              </Link>
            ) : (
              <span className="truncate font-medium text-text">{project.site_manager_name}</span>
            )
          ) : (
            <span className="font-medium text-warning-text">Not assigned</span>
          )}
          <span className="text-xs text-muted">
            {project.open_material_requests} open of {project.total_material_requests} material requests
          </span>
        </div>
      </section>

      <LinkTabs label="Project sections" items={tabItems} active={tab} />

      <Suspense key={`${tab}-${JSON.stringify(query)}`} fallback={<TableSkeleton rows={5} toolbar={false} />}>
        {content}
      </Suspense>
    </div>
  );
}
