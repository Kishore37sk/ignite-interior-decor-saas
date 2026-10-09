import { ArrowRight, ClipboardList, Clock, MessageSquareWarning, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/dates";
import { formatNumber, formatPercent, truncate } from "@/lib/format";
import { uuid } from "@/lib/validation/common";
import { listUserActivity } from "@/features/activity/queries";
import { AssignmentsSection, RequestsSection, UserActivitySection } from "@/features/users/components/detail-sections";
import { MetricRing } from "@/features/users/components/metrics";
import { ReassignProjectsDialog } from "@/features/users/components/reassign-projects-dialog";
import { StaffProfileCard } from "@/features/users/components/staff-profile-card";
import { toManagedUser } from "@/features/users/components/types";
import { UserActions } from "@/features/users/components/user-actions";
import {
  getRecentProjectUpdates,
  getRequestsByUser,
  getSiteManagerPerformance,
  getStaffProfile,
  getUserAssignments,
  listActiveTeam,
} from "@/features/users/queries";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { title: "Site Manager" };
  const profile = await getStaffProfile(parsed.data).catch(() => null);
  return { title: profile?.full_name ?? "Site Manager" };
}

export default async function SiteManagerDetailPage({ params }: PageProps) {
  const owner = await requireRole("owner");
  const { id } = await params;
  const parsed = uuid.safeParse(id);
  if (!parsed.success) notFound();
  const userId = parsed.data;

  const profile = await getStaffProfile(userId);
  if (!profile) notFound();
  if (profile.role === "admin") redirect(`/admins/${userId}`);
  if (profile.role !== "site_manager") notFound();

  const [performance, assignments, updates, requests, activity, team] = await Promise.all([
    getSiteManagerPerformance(),
    getUserAssignments(userId),
    getRecentProjectUpdates(userId, 6),
    getRequestsByUser("requested_by", userId, 6),
    listUserActivity(userId, 12),
    listActiveTeam("site_manager"),
  ]);
  const metrics = performance.find((row) => row.user_id === userId) ?? null;
  const activeAssignments = assignments.filter((a) => a.status === "active" && a.project);
  const assigned = metrics?.assigned_projects ?? activeAssignments.length;
  const completed = metrics?.completed_projects ?? 0;
  const ongoing = metrics?.ongoing_projects ?? 0;
  const delayed = metrics?.delayed_projects ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={profile.full_name}
        back={{ href: "/site-managers", label: "Site Managers" }}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Site Managers", href: "/site-managers" },
          { label: profile.full_name },
        ]}
        meta={<StatusBadge kind="user" value={profile.status} />}
        actions={
          <>
            {activeAssignments.length > 0 ? (
              <ReassignProjectsDialog
                fromUser={{ id: profile.id, full_name: profile.full_name, role: "site_manager", status: profile.status }}
                projects={activeAssignments.map((a) => ({
                  id: a.project_id,
                  name: a.project?.name ?? "Project",
                  project_code: a.project?.project_code ?? "",
                }))}
                candidates={team.filter((member) => member.id !== profile.id)}
              />
            ) : null}
            <UserActions user={toManagedUser(profile)} currentUserId={owner.id} layout="toolbar" />
          </>
        }
      />

      {profile.status === "inactive" && activeAssignments.length > 0 ? (
        <p role="status" className="rounded-2xl bg-warning-bg px-4 py-3 text-sm text-warning-text">
          {`${profile.full_name} is inactive but still assigned to ${activeAssignments.length} project${activeAssignments.length === 1 ? "" : "s"}. Use “Reassign projects” so updates don't stall.`}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <StaffProfileCard profile={profile} lastActive={activity[0]?.created_at ?? null} />

        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricRing
              label="On-time Handover"
              percent={metrics?.on_time_rate ?? null}
              caption={metrics?.on_time_rate !== null && metrics ? `${metrics.on_time_completed}/${completed} projects` : undefined}
              missingHint="No completed projects"
              highlight
              tone="deep"
            />
            <MetricRing
              label="Average Progress"
              percent={metrics?.avg_progress ?? null}
              caption="across projects"
              missingHint="No projects yet"
            />
            <MetricRing
              label="Completed"
              percent={assigned > 0 ? (completed * 100) / assigned : null}
              value={`${completed}`}
              caption={`/${assigned} assigned`}
              missingHint="No projects yet"
            />
            <MetricRing
              label="Delayed"
              percent={ongoing > 0 ? (delayed * 100) / ongoing : null}
              value={`${delayed}`}
              caption={`/${ongoing} ongoing`}
              missingHint="No ongoing projects"
              tone={delayed > 0 ? "danger" : "primary"}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Material Requests"
              value={formatNumber(metrics?.material_requests_created ?? requests.total, 0)}
              unit="created"
              icon={ClipboardList}
              href={`/material-requests?sm=${userId}`}
            />
            <StatCard
              label="Avg Delivery Time"
              value={
                metrics?.avg_request_completion_days !== null && metrics?.avg_request_completion_days !== undefined
                  ? formatNumber(metrics.avg_request_completion_days, 1)
                  : "—"
              }
              unit={metrics?.avg_request_completion_days != null ? "days" : undefined}
              sub={metrics?.avg_request_completion_days != null ? "request → delivered" : "No delivered requests yet"}
              icon={Clock}
            />
            <StatCard
              label="Last Progress Update"
              value={metrics?.last_update_at ? relativeTime(metrics.last_update_at) : "—"}
              sub={metrics?.last_update_at ? formatDate(metrics.last_update_at) : "No updates posted yet"}
              icon={TrendingUp}
            />
          </div>

          <AssignmentsSection assignments={assignments} />

          <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
            <SectionCard
              title="Recent Project Updates"
              action={
                <Link
                  href={`/activity?user=${userId}&entity=project_updates`}
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary-strong hover:underline"
                >
                  All updates <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              }
            >
              {updates.length === 0 ? (
                <EmptyState
                  compact
                  icon={TrendingUp}
                  title="No progress updates yet"
                  description="Updates posted from the site appear here."
                />
              ) : (
                <ul className="-mx-3 flex flex-col divide-y divide-border-soft">
                  {updates.map((u) => (
                    <li key={u.id}>
                      <Link
                        href={`/projects/${u.project_id}?tab=updates`}
                        className="group flex flex-col gap-1.5 rounded-xl px-3 py-3 hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-medium text-text group-hover:text-primary-strong">
                            {u.project?.name ?? "Project"}
                          </span>
                          <span className="text-xs text-muted tabular-nums">{formatDate(u.update_date)}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <StatusBadge kind="project" value={u.status} size="sm" />
                          <span className="tabular-nums">
                            {u.previous_progress !== null
                              ? `${formatPercent(u.previous_progress)} → ${formatPercent(u.progress_percentage)}`
                              : formatPercent(u.progress_percentage)}
                          </span>
                        </span>
                        {u.issues ? (
                          <span className="flex items-start gap-1.5 text-xs text-warning-text">
                            <MessageSquareWarning aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                            {truncate(u.issues, 120)}
                          </span>
                        ) : u.notes ? (
                          <span className="text-xs text-muted">{truncate(u.notes, 120)}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <RequestsSection
              title="Material Requests Created"
              rows={requests.rows}
              total={requests.total}
              viewAllHref={`/material-requests?sm=${userId}`}
              emptyTitle="No material requests yet"
              emptyDescription="Requests raised from their sites will appear here."
            />
          </div>

          <UserActivitySection entries={activity} viewerRole={owner.role} userId={userId} />
        </div>
      </div>
    </div>
  );
}
