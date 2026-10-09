import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { listActivity, toActivityItems } from "../../queries";

export type ActivityTabProps = {
  projectId: string;
  limit: number;
  step: number;
  maxLimit: number;
};

/** Audit trail for this project (activity_feed, audit RLS applies). */
export async function ActivityTab({ projectId, limit, step, maxLimit }: ActivityTabProps) {
  const { rows, hasMore } = await listActivity({ projectIds: [projectId] }, limit);
  const nextLimit = Math.min(limit + step, maxLimit);

  return (
    <SectionCard title="Activity" description="Every change to this project, its milestones, team, documents and material requests.">
      <ActivityTimeline
        items={toActivityItems(rows)}
        groupByDay
        showEntity
        emptyDescription="Updates, assignments, documents and material requests will appear here."
      />
      {hasMore ? (
        <div className="mt-5 flex flex-col items-center gap-2">
          {limit < maxLimit ? (
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}?tab=activity&limit=${nextLimit}`} scroll={false}>
                <ChevronDown aria-hidden="true" />
                Load more
              </Link>
            </Button>
          ) : (
            <Link href={`/activity?project=${projectId}`} className="text-sm font-medium text-primary-strong hover:underline">
              See the full history in the activity log
            </Link>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
