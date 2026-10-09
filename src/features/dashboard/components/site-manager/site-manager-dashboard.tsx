import {
  AlarmClock,
  ArrowRight,
  ClipboardList,
  FolderKanban,
  FolderOpen,
  Hammer,
  PackageCheck,
  PackagePlus,
  SquarePen,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { ProjectCard } from "@/components/shared/project-card";
import { RequiredDateBadge } from "@/components/shared/required-date-badge";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NEAR_DEADLINE_DAYS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getOpenRequestsForSiteManager,
  getSiteManagerProjects,
  getSiteManagerStats,
  SM_PROJECT_LIMIT,
} from "../../queries";
import { RecentActivity } from "../recent-activity";
import { CardSkeleton, KpiGridSkeleton, WidgetError } from "../widget-states";

const softLink =
  "inline-flex h-11 items-center gap-1 rounded-xl bg-soft px-3 sm:h-9 text-sm font-semibold text-deep transition-colors hover:bg-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

async function SiteManagerKpis() {
  const result = await getSiteManagerStats();
  if (!result.ok) return <WidgetError title="My summary" message={result.error} />;
  const s = result.data;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
      <StatCard label="My Projects" value={formatNumber(s.my_projects, 0)} icon={FolderKanban} href="/projects" />
      <StatCard
        label="Active Projects"
        value={formatNumber(s.active_projects, 0)}
        icon={Hammer}
        href="/projects?view=ongoing"
        variant="highlight"
      />
      <StatCard
        label="Near Deadline"
        value={formatNumber(s.near_deadline, 0)}
        unit={`≤ ${NEAR_DEADLINE_DAYS} days`}
        icon={AlarmClock}
        href="/projects?view=near_deadline&sort=expected_completion_date&dir=asc"
      />
      {/* get_site_manager_dashboard.overdue_projects = past deadline OR status 'delayed' — the view=delayed rule. */}
      <StatCard
        label="Delayed / Overdue"
        value={formatNumber(s.overdue_projects, 0)}
        icon={TriangleAlert}
        href="/projects?view=delayed"
        variant={s.overdue_projects > 0 ? "danger" : "default"}
      />
      <StatCard
        label="Pending Requests"
        value={formatNumber(s.pending_material_requests, 0)}
        unit="Materials"
        icon={ClipboardList}
        href="/material-requests?view=pending"
      />
      <StatCard
        label="Delivered"
        value={formatNumber(s.delivered_materials, 0)}
        unit="Requests"
        icon={PackageCheck}
        href="/material-requests?view=completed"
      />
    </div>
  );
}

/** Two big mobile-friendly quick actions (app.md §59). */
async function QuickActions({ userId }: { userId: string }) {
  const projects = await getSiteManagerProjects(userId);
  const onlyProject = projects.ok && projects.data.total === 1 ? projects.data.rows[0] : undefined;
  const updateHref = onlyProject ? `/projects/${onlyProject.id}/update` : "#my-projects";
  const requestHref = onlyProject ? `/material-requests/new?project=${onlyProject.id}` : "/material-requests/new";

  const tile = cn(
    "group flex min-h-20 items-center gap-4 rounded-2xl p-4 shadow-card transition-[box-shadow,transform] duration-200 sm:p-5",
    "hover:-translate-y-0.5 hover:shadow-pop focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
  );

  return (
    <nav aria-label="Quick actions" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
      <Link href={updateHref} className={cn(tile, "bg-primary text-primary-foreground")}>
        <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <SquarePen className="size-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-semibold">Update progress</span>
          <span className="truncate text-sm text-primary-foreground">
            {onlyProject ? onlyProject.name : "Choose a project below to post today's update"}
          </span>
        </span>
        <ArrowRight aria-hidden="true" className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <Link href={requestHref} className={cn(tile, "border border-soft-strong bg-soft text-deep")}>
        <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface text-primary-strong">
          <PackagePlus className="size-6" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-semibold">New material request</span>
          <span className="truncate text-sm text-deep/75">Request materials for a project site</span>
        </span>
        <ArrowRight aria-hidden="true" className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </nav>
  );
}

async function MyProjects({ userId }: { userId: string }) {
  const result = await getSiteManagerProjects(userId);
  if (!result.ok) return <WidgetError title="My projects" message={result.error} />;
  const { rows, total } = result.data;

  return (
    <SectionCard
      id="my-projects"
      title="My Projects"
      description={rows.length > 0 ? "Open projects, nearest deadline first" : undefined}
      className="scroll-mt-28"
      action={
        total > 0 ? (
          <Link href="/projects" className={softLink}>
            View all{total > SM_PROJECT_LIMIT ? ` (${formatNumber(total, 0)})` : ""}
          </Link>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={FolderOpen}
          title="No open projects assigned"
          description="When the owner assigns you to a project it will appear here with its deadline and progress."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {rows.map((project) => (
            <li key={project.id} className="flex min-w-0 flex-col gap-2">
              <ProjectCard project={project} hideSiteManager className="flex-1" />
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="secondary" size="sm" className="h-11 sm:h-9">
                  <Link href={`/projects/${project.id}/update`} aria-label={`Update progress for ${project.name}`}>
                    <SquarePen aria-hidden="true" />
                    Update
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-11 sm:h-9">
                  <Link
                    href={`/material-requests/new?project=${project.id}`}
                    aria-label={`New material request for ${project.name}`}
                  >
                    <PackagePlus aria-hidden="true" />
                    Request material
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

async function MyPendingRequests() {
  const result = await getOpenRequestsForSiteManager(6);
  if (!result.ok) return <WidgetError title="Pending material requests" message={result.error} />;
  const { rows, total } = result.data;

  return (
    <SectionCard
      title="Pending Material Requests"
      description="Open requests on your projects, most urgent first"
      action={
        total > 0 ? (
          <Link href="/material-requests?view=open" className={softLink}>
            View all{total > rows.length ? ` (${formatNumber(total, 0)})` : ""}
          </Link>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={ClipboardList}
          title="No open requests"
          description="Requests you raise stay here until they are delivered."
          action={
            <Button asChild variant="secondary">
              <Link href="/material-requests/new">
                <PackagePlus aria-hidden="true" />
                New request
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border-soft">
          {rows.map((request) => (
            <li key={request.id}>
              <Link
                href={`/material-requests/${request.id}`}
                className="group flex min-w-0 flex-col gap-2 rounded-xl px-2 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text group-hover:text-primary-strong">
                      {request.title}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {request.request_code} · {request.project_name}
                    </p>
                  </div>
                  <StatusBadge kind="material" value={request.status} size="sm" />
                </div>
                {request.items_summary ? (
                  <p className="line-clamp-1 text-xs text-muted">{request.items_summary}</p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  <RequiredDateBadge requiredDate={request.required_date} status={request.status} size="sm" />
                  <PriorityBadge value={request.priority} size="sm" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** Site manager dashboard (app.md §27, §59) — mobile-first, assigned projects only. */
export function SiteManagerDashboard({ userId }: { userId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Your assigned projects, deadlines and material requests." />

      <Suspense
        fallback={
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <CardSkeleton label="Loading quick actions…" height={40} />
            <CardSkeleton label="Loading quick actions…" height={40} />
          </div>
        }
      >
        <QuickActions userId={userId} />
      </Suspense>

      <Suspense fallback={<KpiGridSkeleton count={6} className="grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" />}>
        <SiteManagerKpis />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Suspense fallback={<CardSkeleton label="Loading your projects…" height={420} />}>
            <MyProjects userId={userId} />
          </Suspense>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Suspense fallback={<CardSkeleton label="Loading material requests…" rows={4} />}>
            <MyPendingRequests />
          </Suspense>
          <Suspense fallback={<CardSkeleton label="Loading recent activity…" rows={5} />}>
            <RecentActivity role="site_manager" limit={6} description="Latest changes on your projects" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
