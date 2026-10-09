import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  CalendarRange,
  Flag,
  MapPin,
  MessageSquareText,
  StickyNote,
  Tag,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { CurrencyText } from "@/components/shared/currency-text";
import { DeadlineBadge } from "@/components/shared/deadline-badge";
import { InfoList, InfoRow } from "@/components/shared/info-row";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CurrentUser } from "@/lib/auth";
import { formatDate, formatDateTime, relativeTime } from "@/lib/dates";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProjectDirectoryRow } from "@/types/database";
import {
  getProjectFinancials,
  getProjectMilestones,
  getProjectTeam,
  listProjectUpdates,
  listTeamOptions,
  resolvePeople,
} from "../../queries";
import { MilestoneStrip } from "../milestone-strip";
import { ProjectTeamManager, type TeamMemberView } from "../project-team-manager";

export type OverviewTabProps = {
  project: ProjectDirectoryRow;
  user: CurrentUser;
  canPostUpdate: boolean;
};

function personLabel(name: string, employeeId: string | null): string {
  return employeeId ? `${name} (${employeeId})` : name;
}

/** Overview: key dates & deadline, milestone, latest update, financials, team and notes. */
export async function OverviewTab({ project, user, canPostUpdate }: OverviewTabProps) {
  const isOwner = user.role === "owner";
  const [milestones, latest, financials, team, smOptions, adminOptions] = await Promise.all([
    getProjectMilestones(project.id),
    listProjectUpdates(project.id, 1),
    // RLS returns a row only for the owner or members explicitly granted financial access.
    getProjectFinancials(project.id),
    getProjectTeam(project, user),
    isOwner ? listTeamOptions(["site_manager"]) : Promise.resolve([]),
    isOwner ? listTeamOptions(["admin"]) : Promise.resolve([]),
  ]);
  const latestUpdate = latest.rows[0] ?? null;
  const updater = latestUpdate ? (await resolvePeople([latestUpdate.updated_by], user)).get(latestUpdate.updated_by) : null;

  const currentMilestone =
    milestones.find((m) => m.status === "in_progress") ??
    milestones.find((m) => m.status === "not_started") ??
    null;
  const milestoneName = project.current_milestone ?? currentMilestone?.name ?? null;

  const members: TeamMemberView[] = team.map((m) => ({
    userId: m.userId,
    memberRole: m.memberRole,
    canViewFinancials: m.canViewFinancials,
    name: m.person?.name ?? "Unknown user",
    employeeId: m.person?.employeeId ?? null,
    avatarUrl: m.person?.avatarUrl ?? null,
    status: m.person?.status ?? "inactive",
  }));

  const projectCost = Number(financials?.project_cost ?? 0);
  const advance = Number(financials?.advance_received ?? 0);
  const estimated = Number(financials?.material_estimated_cost ?? 0);
  const approved = Number(financials?.material_approved_cost ?? 0);
  const actual = Number(financials?.material_actual_cost ?? 0);
  const variance = Number(financials?.material_variance ?? actual - estimated);
  const overrun = actual > 0 && variance > 0;
  const location = [project.site_address, project.city].filter(Boolean).join(", ");

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <div className="flex min-w-0 flex-col gap-6">
        <SectionCard
          title="Key dates"
          description="The deadline indicator is calculated from the expected completion date. The status is always set manually."
        >
          <div className="flex flex-col gap-5">
            <InfoList columns={2}>
              <InfoRow icon={CalendarRange} label="Start date" value={project.start_date ? formatDate(project.start_date) : null} />
              <InfoRow
                icon={CalendarClock}
                label="Expected completion"
                value={project.expected_completion_date ? formatDate(project.expected_completion_date) : null}
              />
              <InfoRow icon={Flag} label="Handover date" value={project.handover_date ? formatDate(project.handover_date) : null} />
              <InfoRow
                icon={CalendarCheck}
                label="Actual handover"
                value={project.actual_handover_date ? formatDate(project.actual_handover_date) : null}
                fallback="Not handed over yet"
              />
            </InfoList>
            <div className="flex flex-col gap-3 rounded-xl bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted">Deadline</span>
                <DeadlineBadge deadline={project.deadline_date} status={project.status} />
              </div>
              <div className="flex flex-col gap-1 sm:items-end">
                <span className="text-xs font-medium text-muted">Status (manual)</span>
                <StatusBadge kind="project" value={project.status} />
              </div>
            </div>
            {project.is_overdue && project.status !== "delayed" ? (
              <p className="flex items-start gap-2 rounded-xl bg-danger-bg px-3 py-2.5 text-sm text-danger-text">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                The expected completion date has passed. Update the status or the expected completion date if the plan has changed.
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted">Current milestone</p>
              <p className="text-base font-semibold text-text">{milestoneName ?? "Not set"}</p>
              <MilestoneStrip milestones={milestones} />
              <Link
                href={`/projects/${project.id}?tab=timeline`}
                className="inline-flex w-fit items-center gap-1 text-sm font-medium text-primary-strong hover:underline"
              >
                View timeline
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Latest update"
          action={
            latest.total > 1 ? (
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/projects/${project.id}?tab=updates`}>
                  All {latest.total} updates
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            ) : null
          }
        >
          {latestUpdate ? (
            <div className="flex flex-col gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  name={updater?.name ?? "Team member"}
                  src={updater?.avatarUrl ?? null}
                  colorSeed={latestUpdate.updated_by}
                  size="md"
                  decorative
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">{updater?.name ?? "Team member"}</p>
                  <p className="text-xs text-muted">
                    {formatDate(latestUpdate.update_date)} ·{" "}
                    <time dateTime={latestUpdate.created_at} title={formatDateTime(latestUpdate.created_at)}>
                      {relativeTime(latestUpdate.created_at)}
                    </time>
                  </p>
                </div>
                <span className="ml-auto shrink-0 text-lg font-semibold tabular-nums text-text">
                  {formatPercent(latestUpdate.progress_percentage)}
                </span>
              </div>
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <UpdateText label="Work done / notes" value={latestUpdate.notes} />
                <UpdateText label="Issues" value={latestUpdate.issues} danger />
                <UpdateText label="Next action" value={latestUpdate.next_action} />
              </dl>
            </div>
          ) : (
            <EmptyState
              compact
              icon={MessageSquareText}
              title="No progress updates yet"
              description="Site managers post progress, issues and next actions from the project page."
              action={
                canPostUpdate ? (
                  <Button asChild>
                    <Link href={`/projects/${project.id}/update`}>Post first update</Link>
                  </Button>
                ) : null
              }
            />
          )}
        </SectionCard>

        <SectionCard title="Site & notes">
          <div className="flex flex-col gap-4">
            <InfoList columns={2}>
              <InfoRow icon={Tag} label="Project type" value={project.project_type} />
              <InfoRow icon={MapPin} label="Site" value={location || null} />
            </InfoList>
            {project.notes ? (
              <div className="rounded-xl bg-surface-muted p-4">
                <p className="flex items-center gap-2 text-xs font-medium text-muted">
                  <StickyNote aria-hidden="true" className="size-3.5" />
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-text">{project.notes}</p>
              </div>
            ) : (
              <p className="text-sm text-muted">No notes added.</p>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        {financials ? (
          <SectionCard title="Financials" description={isOwner ? "Visible to you and members you allow." : "Shared with you by the owner."}>
            <dl className="flex flex-col divide-y divide-border-soft text-sm">
              <MoneyRow label="Project cost" value={projectCost} strong />
              <MoneyRow label="Advance received" value={advance} />
              <MoneyRow label="Balance due" value={Math.max(projectCost - advance, 0)} />
              <MoneyRow label="Material — estimated" value={estimated} />
              <MoneyRow label="Material — approved" value={approved} />
              <MoneyRow label="Material — actual" value={actual} />
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt className="text-muted">Variance (actual − estimated)</dt>
                <dd className={cn("font-semibold tabular-nums", overrun ? "text-danger-text" : "text-text")}>
                  <CurrencyText value={actual > 0 ? variance : null} signed invert fallback="—" />
                </dd>
              </div>
            </dl>
            {overrun ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-danger-bg px-3 py-2.5 text-sm text-danger-text">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                Material spend is over the estimate.
              </p>
            ) : null}
            {projectCost > 0 && actual > 0 ? (
              <p className="mt-3 text-xs text-muted">
                Materials so far are {formatPercent((actual / projectCost) * 100, 1)} of the project cost.
              </p>
            ) : null}
          </SectionCard>
        ) : null}

        <SectionCard title="Team" description={isOwner ? "Who works on this project." : undefined}>
          {isOwner ? (
            <ProjectTeamManager
              projectId={project.id}
              archived={Boolean(project.archived_at)}
              members={members}
              siteManagerOptions={smOptions.map((o) => ({ id: o.id, label: personLabel(o.full_name, o.employee_id) }))}
              adminOptions={adminOptions.map((o) => ({ id: o.id, label: personLabel(o.full_name, o.employee_id) }))}
            />
          ) : members.length === 0 ? (
            <EmptyState compact icon={Users} title="No site manager assigned" description="The owner assigns site managers to projects." />
          ) : (
            <ul className="flex flex-col gap-4">
              {members.map((m) => (
                <li key={m.userId} className="flex min-w-0 items-center gap-3">
                  <Avatar name={m.name} src={m.avatarUrl} colorSeed={m.userId} size="md" decorative />
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium text-text">
                      {m.name}
                      {m.userId === user.id ? <Badge tone="soft" size="sm">You</Badge> : null}
                    </p>
                    <p className="text-xs text-muted">Site Manager{m.employeeId ? ` · ${m.employeeId}` : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function UpdateText({ label, value, danger = false }: { label: string; value: string | null; danger?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-xl p-3", danger && value ? "bg-danger-bg" : "bg-surface-muted")}>
      <dt className={cn("text-xs font-medium", danger && value ? "text-danger-text" : "text-muted")}>{label}</dt>
      <dd className="mt-1 whitespace-pre-line break-words text-text">{value || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

function MoneyRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular-nums text-text", strong ? "text-base font-semibold" : "font-medium")}>
        <CurrencyText value={value} />
      </dd>
    </div>
  );
}
