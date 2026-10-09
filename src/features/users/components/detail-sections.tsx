import { ArrowRight, ClipboardList, FolderKanban, History } from "lucide-react";
import Link from "next/link";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import { DeadlineBadge } from "@/components/shared/deadline-badge";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/dates";
import { pluralize } from "@/lib/format";
import type { AppRole } from "@/types/database";
import { activityHref, type ActivityFeedEntry } from "@/features/activity/entities";
import type { AssignmentRow, RequestSummary } from "../queries";

const rowLink =
  "group flex min-w-0 flex-col gap-2 rounded-xl px-3 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-row sm:items-center sm:gap-4";

/** Active assignments with progress/deadline, plus removed ones as history. */
export function AssignmentsSection({ assignments }: { assignments: AssignmentRow[] }) {
  const active = assignments.filter((a) => a.status === "active");
  const removed = assignments.filter((a) => a.status === "removed");
  return (
    <SectionCard
      title="Assigned Projects"
      description={active.length > 0 ? pluralize(active.length, "active assignment") : undefined}
    >
      {active.length === 0 ? (
        <EmptyState
          compact
          icon={FolderKanban}
          title="No active projects"
          description="Use “Assign projects” to give them work. Past assignments stay listed below."
        />
      ) : (
        <ul className="-mx-3 flex flex-col divide-y divide-border-soft">
          {active.map((a) =>
            a.project ? (
              <li key={a.id}>
                <Link href={`/projects/${a.project.id}`} className={rowLink}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-text group-hover:text-primary-strong">{a.project.name}</span>
                    <span className="truncate text-xs text-muted">
                      {a.project.project_code} · {a.project.client_name} · since {formatDate(a.assigned_at)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 sm:w-auto">
                    <StatusBadge kind="project" value={a.project.status} size="sm" />
                    <DeadlineBadge deadline={a.project.deadline_date} status={a.project.status} size="sm" />
                  </span>
                  <ProgressBar
                    value={a.project.progress_percentage}
                    state={a.project.deadline_state}
                    label={`${a.project.name} progress`}
                    size="sm"
                    className="sm:w-36"
                  />
                </Link>
              </li>
            ) : null,
          )}
        </ul>
      )}
      {removed.length > 0 ? (
        <details className="group mt-4 rounded-xl border border-border-soft">
          <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-medium text-text hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            {`Assignment history (${removed.length} removed)`}
          </summary>
          <ul className="flex flex-col divide-y divide-border-soft border-t border-border-soft">
            {removed.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                {a.project ? (
                  <Link href={`/projects/${a.project.id}`} className="truncate font-medium text-text hover:text-primary-strong hover:underline">
                    {a.project.name} <span className="font-normal text-muted">· {a.project.project_code}</span>
                  </Link>
                ) : (
                  <span className="text-muted">Project no longer available</span>
                )}
                <span className="text-xs text-muted">
                  {formatDate(a.assigned_at)} → {formatDate(a.removed_at)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </SectionCard>
  );
}

/** Material requests list (created by an SM or assigned to an admin). */
export function RequestsSection({
  title,
  rows,
  total,
  viewAllHref,
  emptyTitle,
  emptyDescription,
  showRequester = false,
}: {
  title: string;
  rows: RequestSummary[];
  total: number;
  viewAllHref: string;
  emptyTitle: string;
  emptyDescription: string;
  showRequester?: boolean;
}) {
  return (
    <SectionCard
      title={title}
      description={total > 0 ? pluralize(total, "request") : undefined}
      action={
        total > rows.length ? (
          <Link href={viewAllHref} className="inline-flex items-center gap-1 text-sm font-medium text-primary-strong hover:underline">
            View all <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <EmptyState compact icon={ClipboardList} title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="-mx-3 flex flex-col divide-y divide-border-soft">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/material-requests/${r.id}`} className={rowLink}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-text group-hover:text-primary-strong">
                    {r.request_code} · {r.title}
                  </span>
                  <span className="truncate text-xs text-muted">
                    {r.project_code} · {r.project_name}
                    {showRequester && r.requested_by_name ? ` · by ${r.requested_by_name}` : ""}
                    {r.items_summary ? ` · ${r.items_summary}` : ""}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <PriorityBadge value={r.priority} size="sm" />
                  <StatusBadge kind="material" value={r.status} size="sm" />
                  <span className="text-xs text-muted tabular-nums">Need by {formatDate(r.required_date)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function UserActivitySection({
  entries,
  viewerRole,
  userId,
}: {
  entries: ActivityFeedEntry[];
  viewerRole: AppRole;
  userId: string;
}) {
  return (
    <SectionCard
      title="Recent Activity"
      action={
        <Link
          href={`/activity?user=${userId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-strong hover:underline"
        >
          Full log <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      }
    >
      {entries.length === 0 ? (
        <EmptyState compact icon={History} title="No activity yet" description="Their actions will be logged here." />
      ) : (
        <ActivityTimeline
          items={entries.map((e) => ({
            id: e.id,
            actorName: e.actor_name,
            actorId: e.user_id,
            summary: e.summary ?? e.action,
            createdAt: e.created_at,
            entityType: e.entity_type,
            href: activityHref(e, viewerRole),
          }))}
        />
      )}
    </SectionCard>
  );
}
