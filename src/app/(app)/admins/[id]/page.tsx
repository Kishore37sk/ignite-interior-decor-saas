import { CalendarCheck, CircleX, Clock, IndianRupee } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { requireRole } from "@/lib/auth";
import { formatINR, formatNumber } from "@/lib/format";
import { uuid } from "@/lib/validation/common";
import { listUserActivity } from "@/features/activity/queries";
import { AssignmentsSection, RequestsSection, UserActivitySection } from "@/features/users/components/detail-sections";
import { MetricRing } from "@/features/users/components/metrics";
import { ReassignProjectsDialog } from "@/features/users/components/reassign-projects-dialog";
import { StaffProfileCard } from "@/features/users/components/staff-profile-card";
import { toManagedUser } from "@/features/users/components/types";
import { UserActions } from "@/features/users/components/user-actions";
import { formatHours } from "@/features/users/format";
import {
  getAdminPerformance,
  getRequestsByUser,
  getStaffProfile,
  getUserAssignments,
  listActiveTeam,
} from "@/features/users/queries";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return { title: "Admin" };
  const profile = await getStaffProfile(parsed.data).catch(() => null);
  return { title: profile?.full_name ?? "Admin" };
}

export default async function AdminDetailPage({ params }: PageProps) {
  const owner = await requireRole("owner");
  const { id } = await params;
  const parsed = uuid.safeParse(id);
  if (!parsed.success) notFound();
  const userId = parsed.data;

  const profile = await getStaffProfile(userId);
  if (!profile) notFound();
  if (profile.role === "site_manager") redirect(`/site-managers/${userId}`);
  if (profile.role !== "admin") notFound();

  const [performance, requests, assignments, activity, team] = await Promise.all([
    getAdminPerformance(),
    getRequestsByUser("assigned_admin", userId, 8),
    getUserAssignments(userId),
    listUserActivity(userId, 12),
    listActiveTeam("admin"),
  ]);
  const metrics = performance.find((row) => row.user_id === userId) ?? null;
  const assigned = metrics?.requests_assigned ?? requests.total;
  const pending = metrics?.pending ?? 0;
  const processing = metrics?.processing ?? 0;
  const completed = metrics?.completed ?? 0;
  const overdue = metrics?.overdue ?? 0;
  const open = pending + processing;
  const activeAssignments = assignments.filter((a) => a.status === "active" && a.project);
  const responseText = formatHours(metrics?.avg_response_hours ?? null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={profile.full_name}
        back={{ href: "/admins", label: "Admins" }}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admins", href: "/admins" },
          { label: profile.full_name },
        ]}
        meta={<StatusBadge kind="user" value={profile.status} />}
        actions={
          <>
            {activeAssignments.length > 0 ? (
              <ReassignProjectsDialog
                fromUser={{ id: profile.id, full_name: profile.full_name, role: "admin", status: profile.status }}
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

      {profile.status === "inactive" && open > 0 ? (
        <p role="status" className="rounded-2xl bg-warning-bg px-4 py-3 text-sm text-warning-text">
          {`${profile.full_name} is inactive but still has ${open} open request${open === 1 ? "" : "s"} assigned. Reassign them from each request's page so nothing gets stuck.`}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <StaffProfileCard profile={profile} lastActive={activity[0]?.created_at ?? null} />

        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricRing
              label="Completion Rate"
              percent={metrics?.completion_rate ?? null}
              caption={`${completed}/${assigned} delivered`}
              missingHint="No requests yet"
              highlight
              tone="deep"
            />
            <MetricRing
              label="Pending Review"
              percent={assigned > 0 ? (pending * 100) / assigned : null}
              value={`${pending}`}
              caption={`/${assigned} requests`}
              missingHint="No requests yet"
              tone="warning"
            />
            <MetricRing
              label="Processing"
              percent={assigned > 0 ? (processing * 100) / assigned : null}
              value={`${processing}`}
              caption="approved / ordered"
              missingHint="No requests yet"
            />
            <MetricRing
              label="Overdue"
              percent={open > 0 ? (overdue * 100) / open : null}
              value={`${overdue}`}
              caption={`/${open} open`}
              missingHint="No open requests"
              tone={overdue > 0 ? "danger" : "primary"}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Avg Response"
              value={responseText ?? "—"}
              sub={responseText ? "request → first review" : "Nothing reviewed yet"}
              icon={Clock}
            />
            <StatCard
              label="Avg Completion"
              value={metrics?.avg_completion_days != null ? formatNumber(metrics.avg_completion_days, 1) : "—"}
              unit={metrics?.avg_completion_days != null ? "days" : undefined}
              sub={metrics?.avg_completion_days != null ? "request → delivered" : "No deliveries yet"}
              icon={CalendarCheck}
            />
            <StatCard
              label="Rejected"
              value={formatNumber(metrics?.rejected ?? 0, 0)}
              unit="requests"
              icon={CircleX}
              href={`/material-requests?admin=${userId}&status=rejected`}
            />
            <StatCard
              label="Value Managed"
              value={formatINR(metrics?.total_value_managed ?? 0, { compact: true })}
              sub="excl. rejected & cancelled"
              icon={IndianRupee}
            />
          </div>

          <RequestsSection
            title="Assigned Material Requests"
            rows={requests.rows}
            total={requests.total}
            viewAllHref={`/material-requests?admin=${userId}`}
            emptyTitle="No requests assigned"
            emptyDescription="Requests they claim or that you assign to them will appear here."
            showRequester
          />

          {assignments.length > 0 ? <AssignmentsSection assignments={assignments} /> : null}

          <UserActivitySection entries={activity} viewerRole={owner.role} userId={userId} />
        </div>
      </div>
    </div>
  );
}
