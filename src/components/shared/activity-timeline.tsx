import { History } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { addDays, formatDate, formatTime, todayIST, toDateOnly } from "@/lib/dates";
import { humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ActivityItem = {
  id: string;
  actorName: string | null;
  /** Human sentence from `audit_logs.summary`. */
  summary: string;
  /** ISO timestamp. */
  createdAt: string;
  entityType?: string | null;
  href?: string | null;
  actorId?: string | null;
  actorAvatarUrl?: string | null;
};

export type ActivityTimelineProps = {
  items: readonly ActivityItem[];
  /** Group under day headings (`08 Oct 2026`, Today, Yesterday). Default true. */
  groupByDay?: boolean;
  /** Show the entity type chip (e.g. "Material Request"). */
  showEntity?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
};

const ENTITY_LABELS: Record<string, string> = {
  projects: "Project",
  project_updates: "Progress Update",
  project_milestones: "Milestone",
  project_members: "Team",
  project_documents: "Document",
  project_financials: "Financials",
  clients: "Client",
  material_requests: "Material Request",
  material_request_items: "Material Item",
  material_deliveries: "Delivery",
  material_request_comments: "Comment",
  materials: "Material Catalog",
  profiles: "User",
  company_settings: "Settings",
};

function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? humanize(entityType);
}

function dayHeading(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return formatDate(day);
}

type DayGroup = { day: string; items: ActivityItem[] };

function groupItems(items: readonly ActivityItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  const byDay = new Map<string, DayGroup>();
  for (const item of items) {
    const day = toDateOnly(item.createdAt) ?? "unknown";
    let group = byDay.get(day);
    if (!group) {
      group = { day, items: [] };
      byDay.set(day, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** Splits a leading actor name off the summary so it can be emphasised (TeamHub style). */
function SummaryText({ actorName, summary }: { actorName: string | null; summary: string }) {
  const name = actorName?.trim();
  if (name && summary.startsWith(name)) {
    return (
      <>
        <strong className="font-semibold text-text">{name}</strong>
        {summary.slice(name.length)}
      </>
    );
  }
  return (
    <>
      {name ? <strong className="font-semibold text-text">{name}: </strong> : null}
      {summary}
    </>
  );
}

function TimelineEntry({ item, isLast, showEntity }: { item: ActivityItem; isLast: boolean; showEntity: boolean }) {
  const time = formatTime(item.createdAt);
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {isLast ? null : (
        <span aria-hidden="true" className="absolute bottom-0 left-[19px] top-11 w-px bg-border" />
      )}
      <Avatar
        name={item.actorName ?? "System"}
        src={item.actorAvatarUrl}
        colorSeed={item.actorId ?? undefined}
        size="md"
        decorative
        className="ring-4 ring-surface"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <p className="break-words text-sm leading-relaxed text-text/90">
          {item.href ? (
            <Link
              href={item.href}
              className="rounded-sm hover:text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <SummaryText actorName={item.actorName} summary={item.summary} />
            </Link>
          ) : (
            <SummaryText actorName={item.actorName} summary={item.summary} />
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <time dateTime={item.createdAt}>{`${formatDate(item.createdAt)} · ${time}`}</time>
          {showEntity && item.entityType ? (
            <span className="rounded-full bg-soft px-2 py-0.5 font-medium text-deep">{entityLabel(item.entityType)}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Audit/activity feed: avatar dots on a vertical line, grouped by IST day (app.md §77). */
export function ActivityTimeline({
  items,
  groupByDay = true,
  showEntity = true,
  emptyTitle = "No activity yet",
  emptyDescription = "Updates, approvals and changes will appear here as they happen.",
  className,
}: ActivityTimelineProps) {
  if (items.length === 0) {
    return <EmptyState compact icon={History} title={emptyTitle} description={emptyDescription} className={className} />;
  }

  if (!groupByDay) {
    return (
      <ol className={cn("flex flex-col", className)}>
        {items.map((item, index) => (
          <TimelineEntry key={item.id} item={item} isLast={index === items.length - 1} showEntity={showEntity} />
        ))}
      </ol>
    );
  }

  const today = todayIST();
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {groupItems(items).map((group) => (
        <section key={group.day} aria-label={group.day === "unknown" ? "Undated" : dayHeading(group.day, today)}>
          <h3 className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted">
            {group.day === "unknown" ? "Undated" : <time dateTime={group.day}>{dayHeading(group.day, today)}</time>}
            <span aria-hidden="true" className="h-px flex-1 bg-border-soft" />
          </h3>
          <ol className="flex flex-col">
            {group.items.map((item, index) => (
              <TimelineEntry
                key={item.id}
                item={item}
                isLast={index === group.items.length - 1}
                showEntity={showEntity}
              />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
