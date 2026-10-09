import Link from "next/link";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import { SectionCard } from "@/components/shared/section-card";
import type { AppRole } from "@/types/database";
import { toActivityItems } from "../activity";
import { getRecentActivity } from "../queries";
import { WidgetError } from "./widget-states";

/** Latest audit entries the viewer may see (activity_feed is RLS-scoped per role). */
export async function RecentActivity({
  role,
  limit = 8,
  description,
  className,
}: {
  role: AppRole;
  limit?: number;
  description?: string;
  className?: string;
}) {
  const result = await getRecentActivity(limit);
  if (!result.ok) return <WidgetError title="Recent activity" message={result.error} className={className} />;

  return (
    <SectionCard
      title="Recent Activity"
      description={description}
      className={className}
      action={
        <Link
          href="/activity"
          className="inline-flex h-9 items-center rounded-xl bg-soft px-3 text-sm font-semibold text-deep transition-colors hover:bg-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          View all
        </Link>
      }
    >
      <ActivityTimeline
        items={toActivityItems(result.data, role)}
        emptyDescription="Project updates, material requests and approvals will appear here as they happen."
      />
    </SectionCard>
  );
}
