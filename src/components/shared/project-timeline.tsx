import { CircleCheck, CircleDashed, CircleDot, CircleMinus, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, todayIST } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { MilestoneStatus, ProjectMilestone } from "@/types/database";
import { StatusBadge } from "./status-badge";

export type TimelineMilestone = Pick<
  ProjectMilestone,
  "id" | "name" | "status" | "start_date" | "target_date" | "completed_date" | "notes" | "sort_order"
>;

export type ProjectTimelineProps = {
  milestones: readonly TimelineMilestone[];
  /** Per-milestone action slot (e.g. an "Edit" dialog trigger for owners / assigned SMs). */
  renderAction?: (milestone: TimelineMilestone) => ReactNode;
  /** Override "today" (IST `YYYY-MM-DD`), mainly for tests. */
  today?: string;
  className?: string;
};

const STEP: Record<MilestoneStatus, { icon: LucideIcon; ring: string }> = {
  completed: { icon: CircleCheck, ring: "bg-primary text-white" },
  in_progress: { icon: CircleDot, ring: "bg-soft text-primary-strong ring-2 ring-primary" },
  not_started: { icon: CircleDashed, ring: "bg-surface-muted text-muted" },
  skipped: { icon: CircleMinus, ring: "bg-surface-muted text-muted" },
};

function isOverdue(milestone: TimelineMilestone, today: string): boolean {
  if (milestone.status === "completed" || milestone.status === "skipped") return false;
  return milestone.target_date !== null && milestone.target_date < today;
}

function DateItem({ label, value, danger = false }: { label: string; value: string | null; danger?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cn("text-sm tabular-nums", value ? (danger ? "font-semibold text-danger-text" : "text-text") : "text-muted")}>
        {formatDate(value)}
      </dd>
    </div>
  );
}

/**
 * Vertical milestone stepper (Project Started → … → Completed) with status icons,
 * start/target/completed dates, notes and overdue highlighting.
 */
export function ProjectTimeline({ milestones, renderAction, today = todayIST(), className }: ProjectTimelineProps) {
  if (milestones.length === 0) {
    return (
      <EmptyState
        compact
        icon={CircleDashed}
        title="No milestones yet"
        description="Milestones are created automatically when a project is added."
        className={className}
      />
    );
  }

  const ordered = [...milestones].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <ol className={cn("flex flex-col", className)} aria-label="Project milestones">
      {ordered.map((milestone, index) => {
        const step = STEP[milestone.status];
        const Icon = step.icon;
        const overdue = isOverdue(milestone, today);
        const isLast = index === ordered.length - 1;
        const action = renderAction?.(milestone);

        return (
          <li key={milestone.id} className="relative flex gap-4 pb-6 last:pb-0">
            {isLast ? null : (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute bottom-0 left-[17px] top-10 w-0.5 rounded-full",
                  milestone.status === "completed" ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                "relative z-[1] inline-flex size-9 shrink-0 items-center justify-center rounded-full",
                overdue ? "bg-danger-bg text-danger ring-2 ring-danger" : step.ring,
              )}
            >
              {overdue ? <TriangleAlert className="size-[18px]" /> : <Icon className="size-[18px]" />}
            </span>
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-3 rounded-2xl border p-4",
                overdue
                  ? "border-danger/30 bg-danger-bg/40"
                  : milestone.status === "in_progress"
                    ? "border-primary/30 bg-soft/40"
                    : "border-border-soft bg-surface",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-text">
                    <span className="sr-only">{`Step ${index + 1}: `}</span>
                    {milestone.name}
                  </h3>
                  <StatusBadge kind="milestone" value={milestone.status} size="sm" />
                  {overdue ? (
                    <Badge tone="danger" size="sm">
                      Overdue
                    </Badge>
                  ) : null}
                </div>
                {action ? <div className="shrink-0">{action}</div> : null}
              </div>
              <dl className="grid grid-cols-3 gap-3">
                <DateItem label="Start" value={milestone.start_date} />
                <DateItem label="Target" value={milestone.target_date} danger={overdue} />
                <DateItem label="Completed" value={milestone.completed_date} />
              </dl>
              {milestone.notes ? (
                <p className="whitespace-pre-line break-words rounded-xl bg-surface-muted px-3 py-2 text-sm text-muted">
                  {milestone.notes}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
