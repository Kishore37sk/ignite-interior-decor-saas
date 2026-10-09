import { CalendarCheck, Package, UserRound } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ProjectDirectoryRow } from "@/types/database";
import { DeadlineBadge } from "./deadline-badge";
import { ProgressBar } from "./progress-bar";
import { StatusBadge } from "./status-badge";

export type ProjectCardData = Pick<
  ProjectDirectoryRow,
  "id" | "name" | "project_code" | "client_name" | "status" | "progress_percentage" | "handover_date"
> &
  Partial<
    Pick<
      ProjectDirectoryRow,
      | "deadline_date"
      | "expected_completion_date"
      | "deadline_state"
      | "open_material_requests"
      | "total_material_requests"
      | "site_manager_name"
      | "city"
      | "current_milestone"
    >
  >;

export type ProjectCardProps = {
  project: ProjectCardData;
  /** Defaults to `/projects/<id>`. */
  href?: string;
  /** Hide the site manager line (e.g. on a site manager's own dashboard). */
  hideSiteManager?: boolean;
  className?: string;
};

/** Mobile-friendly project summary card linking to the project detail page. */
export function ProjectCard({ project, href, hideSiteManager = false, className }: ProjectCardProps) {
  const deadline = project.deadline_date ?? project.expected_completion_date ?? null;
  const openRequests = project.open_material_requests ?? 0;
  const totalRequests = project.total_material_requests;

  return (
    <article
      className={cn(
        "card-surface group relative flex min-w-0 flex-col gap-4 p-5 transition-[box-shadow,border-color] duration-200",
        "hover:border-primary/30 hover:shadow-pop",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">
            {project.project_code}
            {project.city ? ` · ${project.city}` : ""}
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-text">
            <Link
              href={href ?? `/projects/${project.id}`}
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-primary"
            >
              {project.name}
            </Link>
          </h3>
          <p className="truncate text-sm text-muted">{project.client_name}</p>
        </div>
        <StatusBadge kind="project" value={project.status} className="shrink-0" />
      </div>

      <ProgressBar
        value={project.progress_percentage}
        label={`${project.name} progress`}
        state={project.deadline_state ?? null}
      />
      {project.current_milestone ? (
        <p className="-mt-2 truncate text-xs text-muted">
          Current stage: <span className="font-medium text-text">{project.current_milestone}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <DeadlineBadge deadline={deadline} status={project.status} />
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-border-soft pt-4 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarCheck aria-hidden="true" className="size-4 shrink-0 text-primary-strong" />
          <div className="min-w-0">
            <dt className="text-xs text-muted">Handover</dt>
            <dd className="truncate font-medium tabular-nums text-text">{formatDate(project.handover_date)}</dd>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <Package aria-hidden="true" className="size-4 shrink-0 text-primary-strong" />
          <div className="min-w-0">
            <dt className="text-xs text-muted">Material requests</dt>
            <dd className="truncate font-medium tabular-nums text-text">
              {openRequests} open
              {totalRequests !== undefined ? <span className="font-normal text-muted"> / {totalRequests}</span> : null}
            </dd>
          </div>
        </div>
        {!hideSiteManager && project.site_manager_name !== undefined ? (
          <div className="col-span-2 flex min-w-0 items-center gap-2">
            <UserRound aria-hidden="true" className="size-4 shrink-0 text-primary-strong" />
            <div className="min-w-0">
              <dt className="text-xs text-muted">Site manager</dt>
              <dd className={cn("truncate font-medium", project.site_manager_name ? "text-text" : "text-muted")}>
                {project.site_manager_name ?? "Not assigned"}
              </dd>
            </div>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
