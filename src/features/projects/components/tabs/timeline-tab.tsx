import { ProjectTimeline } from "@/components/shared/project-timeline";
import { SectionCard } from "@/components/shared/section-card";
import { MILESTONE_STATUS_LABELS } from "@/lib/constants";
import type { MilestoneStatus } from "@/types/database";
import { getProjectMilestones } from "../../queries";
import { MilestoneEditDialog } from "../milestone-edit-dialog";

export type TimelineTabProps = {
  projectId: string;
  /** Owner, or an assigned site manager on an open project. */
  canEdit: boolean;
  lockedReason?: string | null;
};

const SUMMARY_ORDER: MilestoneStatus[] = ["completed", "in_progress", "not_started", "skipped"];

/** Milestone stepper with per-milestone edit dialogs. */
export async function TimelineTab({ projectId, canEdit, lockedReason }: TimelineTabProps) {
  const milestones = await getProjectMilestones(projectId);
  const counts = SUMMARY_ORDER.map((status) => ({
    status,
    count: milestones.filter((m) => m.status === status).length,
  })).filter((c) => c.count > 0);

  return (
    <SectionCard
      title="Project timeline"
      description={
        counts.length > 0
          ? counts.map((c) => `${c.count} ${MILESTONE_STATUS_LABELS[c.status].toLowerCase()}`).join(" · ")
          : "Milestones from project start to completion."
      }
    >
      {lockedReason && !canEdit ? <p className="mb-4 text-sm text-muted">{lockedReason}</p> : null}
      <ProjectTimeline
        milestones={milestones}
        renderAction={
          canEdit
            ? (milestone) => (
                <MilestoneEditDialog
                  projectId={projectId}
                  milestone={{
                    id: milestone.id,
                    name: milestone.name,
                    status: milestone.status,
                    start_date: milestone.start_date,
                    target_date: milestone.target_date,
                    completed_date: milestone.completed_date,
                    notes: milestone.notes,
                  }}
                />
              )
            : undefined
        }
      />
    </SectionCard>
  );
}
