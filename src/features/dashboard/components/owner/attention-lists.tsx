import { CalendarClock, CircleCheckBig, FolderClock, PackageSearch } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { DeadlineBadge } from "@/components/shared/deadline-badge";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { RequiredDateBadge } from "@/components/shared/required-date-badge";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getNeedsAttention, getUpcomingHandovers } from "../../queries";
import { WidgetError } from "../widget-states";

const rowLink = cn(
  "group flex min-w-0 items-start gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-muted",
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
);

const footerLink =
  "rounded-sm text-sm font-semibold text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function IconTile({ tone, children }: { tone: "danger" | "warning" | "soft"; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-4",
        tone === "danger" && "bg-danger-bg text-danger",
        tone === "warning" && "bg-warning-bg text-warning-text",
        tone === "soft" && "bg-soft text-deep",
      )}
    >
      {children}
    </span>
  );
}

/** Overdue/delayed projects and overdue or high-priority open material requests. */
export async function NeedsAttention({ className }: { className?: string }) {
  const result = await getNeedsAttention(5);
  if (!result.ok) return <WidgetError title="Needs attention" message={result.error} className={className} />;
  const { projects, requests } = result.data;
  const empty = projects.rows.length === 0 && requests.rows.length === 0;

  return (
    <SectionCard
      title="Needs Attention"
      description="Overdue projects and urgent or overdue material requests"
      className={className}
      footer={
        empty ? undefined : (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/projects?view=delayed" className={footerLink}>
              All delayed projects ({formatNumber(projects.total, 0)})
            </Link>
            <Link href="/material-requests?view=overdue" className={footerLink}>
              Overdue requests
            </Link>
          </div>
        )
      }
    >
      {empty ? (
        <EmptyState
          compact
          icon={CircleCheckBig}
          title="Nothing needs attention"
          description="No overdue projects and no overdue or high-priority material requests right now."
        />
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Projects ({formatNumber(projects.total, 0)})
            </h3>
            {projects.rows.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">No overdue or delayed projects.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-soft">
                {projects.rows.map((project) => (
                  <li key={project.id}>
                    <Link href={`/projects/${project.id}`} className={rowLink}>
                      <IconTile tone="danger">
                        <FolderClock />
                      </IconTile>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <p className="truncate text-sm font-semibold text-text group-hover:text-primary-strong">
                          {project.name}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {project.project_code} · {project.client_name}
                          {project.site_manager_name ? ` · ${project.site_manager_name}` : " · No site manager"}
                        </p>
                        <DeadlineBadge deadline={project.deadline_date} status={project.status} size="sm" className="w-fit" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Material requests ({formatNumber(requests.total, 0)})
            </h3>
            {requests.rows.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">No overdue or high-priority requests.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border-soft">
                {requests.rows.map((request) => (
                  <li key={request.id}>
                    <Link href={`/material-requests/${request.id}`} className={rowLink}>
                      <IconTile tone={request.required_state === "overdue" ? "danger" : "warning"}>
                        <PackageSearch />
                      </IconTile>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <p className="truncate text-sm font-semibold text-text group-hover:text-primary-strong">
                          {request.request_code} · {request.title}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {request.project_name}
                          {request.items_summary ? ` · ${request.items_summary}` : ""}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <RequiredDateBadge requiredDate={request.required_date} status={request.status} size="sm" />
                          <PriorityBadge value={request.priority} size="sm" />
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/** Projects handing over in the next 30 days. */
export async function UpcomingHandovers({ className }: { className?: string }) {
  const result = await getUpcomingHandovers(6);
  if (!result.ok) return <WidgetError title="Upcoming handovers" message={result.error} className={className} />;
  const { rows, total } = result.data;

  return (
    <SectionCard
      title="Upcoming Handovers"
      description="Due in the next 30 days"
      className={className}
      action={
        rows.length > 0 ? (
          <Link
            href="/projects?view=upcoming_handover"
            className="inline-flex h-9 items-center rounded-xl bg-soft px-3 text-sm font-semibold text-deep transition-colors hover:bg-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            View all{total > rows.length ? ` (${formatNumber(total, 0)})` : ""}
          </Link>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarClock}
          title="No handovers in the next 30 days"
          description="Projects appear here as their handover dates approach."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border-soft">
          {rows.map((project) => {
            const date = project.handover_date ?? project.expected_completion_date;
            return (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} className={rowLink}>
                  <IconTile tone="soft">
                    <CalendarClock />
                  </IconTile>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-text group-hover:text-primary-strong">
                        {project.name}
                      </p>
                      <DeadlineBadge deadline={date} status={project.status} size="sm" />
                    </div>
                    <p className="truncate text-xs text-muted">
                      {project.client_name} · {project.handover_date ? "Handover" : "Expected completion"}{" "}
                      {formatDate(date)}
                    </p>
                    <ProgressBar value={project.progress_percentage} label={`${project.name} progress`} size="sm" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
