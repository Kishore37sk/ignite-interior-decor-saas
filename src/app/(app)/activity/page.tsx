import { History, SearchX } from "lucide-react";
import type { Metadata } from "next";
import { FilterBar, type FilterSelect } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { requireUser } from "@/lib/auth";
import type { SearchParamsRecord } from "@/lib/search-params";
import { ActivityFeedList } from "@/features/activity/components/activity-feed-list";
import { entityLabel, entityTypesForRole } from "@/features/activity/entities";
import { ACTIVITY_RANGE_PRESETS, getActivityFilterOptions, listActivity } from "@/features/activity/queries";

export const metadata: Metadata = { title: "Activity" };

type PageProps = { searchParams: Promise<SearchParamsRecord> };

const DESCRIPTIONS = {
  owner: "Every important change across the business — who did what, when, and what it was before. Expand “Changes” to see old and new values.",
  admin: "Your own actions and the changes on material requests you handle.",
  site_manager: "Your own actions and the changes on projects you are assigned to.",
} as const;

export default async function ActivityPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const [{ filters, rows, total }, options] = await Promise.all([
    listActivity(params, user),
    getActivityFilterOptions(user),
  ]);
  const isOwner = user.role === "owner";
  const hasFilters = Boolean(
    filters.q || filters.entity || filters.user || filters.project || filters.from || filters.to,
  );

  const selects: FilterSelect[] = [
    {
      param: "entity",
      label: "Type",
      allLabel: "All types",
      options: entityTypesForRole(user.role).map((value) => ({ value, label: entityLabel(value) })),
    },
    ...(isOwner ? [{ param: "user", label: "Person", allLabel: "Everyone", options: options.users }] : []),
    { param: "project", label: "Project", allLabel: "All projects", options: options.projects },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Activity" }]}
        description={DESCRIPTIONS[user.role]}
      />

      <section aria-label="Activity log" className="card-surface flex min-w-0 flex-col gap-5 p-4 sm:p-6">
        <FilterBar
          searchPlaceholder="Search activity or person…"
          filters={selects}
          dateRange={{ label: "Date", presets: ACTIVITY_RANGE_PRESETS, anyLabel: "Any time" }}
        />

        {rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="No activity matches these filters"
              description="Try a wider date range, a different person or project, or clear the filters."
            />
          ) : (
            <EmptyState
              icon={History}
              title="No activity yet"
              description={
                isOwner
                  ? "Changes to clients, projects, material requests and users will be logged here automatically."
                  : "Your updates, requests and changes on your projects will appear here."
              }
            />
          )
        ) : (
          <ActivityFeedList rows={rows} viewerRole={user.role} />
        )}

        {total > 0 ? (
          <div className="border-t border-border-soft pt-4">
            <Pagination
              total={total}
              page={filters.page}
              pageSize={filters.pageSize}
              pageSizeOptions={[25, 50, 100]}
              itemLabel="entries"
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
