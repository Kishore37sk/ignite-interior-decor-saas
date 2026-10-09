import { ArrowRight, ChevronDown, MessageSquareText, Plus } from "lucide-react";
import Link from "next/link";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CurrentUser } from "@/lib/auth";
import { formatDate, formatDateTime, relativeTime } from "@/lib/dates";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listProjectUpdates, resolvePeople } from "../../queries";

export type UpdatesTabProps = {
  projectId: string;
  user: CurrentUser;
  limit: number;
  step: number;
  canPostUpdate: boolean;
};

/** Append-only progress update history, newest first. */
export async function UpdatesTab({ projectId, user, limit, step, canPostUpdate }: UpdatesTabProps) {
  const { rows, total } = await listProjectUpdates(projectId, limit);
  const people = await resolvePeople(
    rows.map((r) => r.updated_by),
    user,
  );

  return (
    <SectionCard
      title="Progress updates"
      description={total > 0 ? `${total} ${total === 1 ? "update" : "updates"} · history is never overwritten` : undefined}
      action={
        canPostUpdate ? (
          <Button size="sm" asChild>
            <Link href={`/projects/${projectId}/update`}>
              <Plus aria-hidden="true" />
              Post update
            </Link>
          </Button>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={MessageSquareText}
          title="No progress updates yet"
          description="Each update records status, progress, issues and next action, building a full history of the project."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <ol className="flex flex-col gap-4">
            {rows.map((update) => {
              const person = people.get(update.updated_by);
              const statusChanged = update.previous_status !== null && update.previous_status !== update.status;
              const prevProgress = update.previous_progress;
              const progressChanged = prevProgress !== null && Number(prevProgress) !== Number(update.progress_percentage);
              const delta = prevProgress !== null ? Number(update.progress_percentage) - Number(prevProgress) : null;
              return (
                <li key={update.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border-soft p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar
                      name={person?.name ?? "Team member"}
                      src={person?.avatarUrl ?? null}
                      colorSeed={update.updated_by}
                      size="sm"
                      decorative
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">
                        {person?.name ?? "Team member"}
                        {person && person.status !== "active" ? <span className="font-normal text-muted"> (inactive)</span> : null}
                      </p>
                      <p className="text-xs text-muted">
                        Update for <span className="font-medium text-text">{formatDate(update.update_date)}</span> · posted{" "}
                        <time dateTime={update.created_at} title={formatDateTime(update.created_at)}>
                          {relativeTime(update.created_at)}
                        </time>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted">Status</span>
                      {statusChanged && update.previous_status ? (
                        <>
                          <StatusBadge kind="project" value={update.previous_status} size="sm" appearance="soft" />
                          <ArrowRight aria-hidden="true" className="size-3.5 text-muted" />
                          <span className="sr-only">changed to</span>
                        </>
                      ) : null}
                      <StatusBadge kind="project" value={update.status} size="sm" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted">Progress</span>
                      {progressChanged ? (
                        <>
                          <span className="tabular-nums text-muted">{formatPercent(prevProgress)}</span>
                          <ArrowRight aria-hidden="true" className="size-3.5 text-muted" />
                          <span className="sr-only">changed to</span>
                        </>
                      ) : null}
                      <span className="font-semibold tabular-nums text-text">{formatPercent(update.progress_percentage)}</span>
                      {delta !== null && delta !== 0 ? (
                        <span className={cn("text-xs font-medium tabular-nums", delta > 0 ? "text-primary-strong" : "text-danger-text")}>
                          ({delta > 0 ? "+" : ""}
                          {formatPercent(delta)})
                        </span>
                      ) : null}
                    </div>
                    {update.milestone ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">Milestone</span>
                        <span className="font-medium text-text">{update.milestone}</span>
                      </div>
                    ) : null}
                    {update.expected_completion_date ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">Expected completion</span>
                        <span className="font-medium tabular-nums text-text">{formatDate(update.expected_completion_date)}</span>
                      </div>
                    ) : null}
                  </div>

                  {update.notes || update.issues || update.next_action ? (
                    <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                      {update.notes ? <TextBlock label="Notes" value={update.notes} /> : null}
                      {update.issues ? <TextBlock label="Issues" value={update.issues} danger /> : null}
                      {update.next_action ? <TextBlock label="Next action" value={update.next_action} /> : null}
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {total > rows.length ? (
            <div className="flex justify-center">
              <Button variant="outline" asChild>
                <Link href={`/projects/${projectId}?tab=updates&limit=${limit + step}`} scroll={false}>
                  <ChevronDown aria-hidden="true" />
                  Load more ({total - rows.length} older)
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

function TextBlock({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-xl p-3", danger ? "bg-danger-bg" : "bg-surface-muted")}>
      <dt className={cn("text-xs font-medium", danger ? "text-danger-text" : "text-muted")}>{label}</dt>
      <dd className="mt-1 whitespace-pre-line break-words text-text">{value}</dd>
    </div>
  );
}
