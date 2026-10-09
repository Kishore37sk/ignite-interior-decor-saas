import { MILESTONE_STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { MilestoneStatus } from "@/types/database";

export type StripMilestone = { id: string; name: string; status: MilestoneStatus; sort_order: number };

const SEGMENT: Record<MilestoneStatus, string> = {
  completed: "bg-brand",
  in_progress: "bg-deep",
  not_started: "bg-surface-sunken",
  skipped: "bg-grey",
};

/** Compact horizontal timeline summary: one segment per milestone. */
export function MilestoneStrip({ milestones, className }: { milestones: readonly StripMilestone[]; className?: string }) {
  if (milestones.length === 0) return null;
  const ordered = [...milestones].sort((a, b) => a.sort_order - b.sort_order);
  const done = ordered.filter((m) => m.status === "completed").length;
  const current =
    ordered.find((m) => m.status === "in_progress") ?? ordered.find((m) => m.status === "not_started") ?? null;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <ol className="flex gap-1" aria-label="Milestones">
        {ordered.map((m) => (
          <li
            key={m.id}
            title={`${m.name}: ${MILESTONE_STATUS_LABELS[m.status]}`}
            className={cn("h-1.5 flex-1 rounded-full", SEGMENT[m.status])}
          >
            <span className="sr-only">{`${m.name}: ${MILESTONE_STATUS_LABELS[m.status]}`}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        <span className="font-medium tabular-nums text-text">{`${done} of ${ordered.length}`}</span> milestones complete
        {current ? (
          <>
            {" · "}
            {current.status === "in_progress" ? "Current: " : "Next: "}
            <span className="font-medium text-text">{current.name}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
