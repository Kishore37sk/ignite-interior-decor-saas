import { ArrowRight, GanttChart } from "lucide-react";
import Link from "next/link";
import { DeadlineBadge } from "@/components/shared/deadline-badge";
import { SectionCard } from "@/components/shared/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { addDays, daysBetween, formatDate, formatDayMonth, formatMonth, todayIST, toDateOnly } from "@/lib/dates";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GANTT_LIMIT, getTimelineProjects } from "../../queries";
import type { GanttProject } from "../../types";
import { WidgetError } from "../widget-states";

/** Bars never stretch the axis beyond a year either side of today. */
const MAX_SPAN_DAYS = 365;

type Bar = {
  project: GanttProject;
  start: string;
  /** Planned end: handover date, else expected completion. */
  end: string | null;
  /** Deadline used for the badge (expected completion, else handover). */
  deadline: string | null;
  overdue: boolean;
};

function monthStart(dateOnly: string): string {
  return `${dateOnly.slice(0, 7)}-01`;
}

function nextMonth(firstOfMonth: string): string {
  const [y, m] = firstOfMonth.split("-").map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function buildBars(projects: readonly GanttProject[], today: string): Bar[] {
  return projects.map((project) => {
    const start = project.start_date ?? toDateOnly(project.created_at) ?? today;
    const end = project.handover_date ?? project.expected_completion_date ?? null;
    return {
      project,
      start,
      end: end && end < start ? start : end,
      deadline: project.expected_completion_date ?? project.handover_date ?? null,
      overdue: project.is_overdue || project.status === "delayed",
    };
  });
}

/**
 * Project timeline (app.md §11): each ongoing project is a bar from its start date to its
 * handover (or expected completion) date, with progress fill, a "today" marker and red
 * highlighting for overdue projects. Pure CSS, responsive (stacks on phones).
 */
export async function ProjectGantt() {
  const result = await getTimelineProjects();
  if (!result.ok) return <WidgetError title="Project timeline" message={result.error} />;
  const { rows, total } = result.data;
  const today = todayIST();

  const viewAll = (
    <Link
      href="/projects?view=ongoing&sort=expected_completion_date&dir=asc"
      className="inline-flex h-9 items-center gap-1 rounded-xl bg-soft px-3 text-sm font-semibold text-deep transition-colors hover:bg-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      View all{total > GANTT_LIMIT ? ` (${formatNumber(total, 0)})` : ""}
      <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );

  if (rows.length === 0) {
    return (
      <SectionCard title="Project Timeline" description="Ongoing projects from start to handover" action={viewAll}>
        <EmptyState
          compact
          icon={GanttChart}
          title="No ongoing projects"
          description="When projects are in planning, design or execution they appear here on a timeline."
        />
      </SectionCard>
    );
  }

  const bars = buildBars(rows, today);

  // Axis domain: whole months covering every bar and today, clamped to ±1 year of today.
  let domainStart = today;
  let domainEnd = addDays(today, 14);
  for (const bar of bars) {
    domainStart = minDate(domainStart, bar.start);
    domainEnd = maxDate(domainEnd, bar.end ?? today);
  }
  domainStart = monthStart(maxDate(domainStart, addDays(today, -MAX_SPAN_DAYS)));
  domainEnd = addDays(nextMonth(monthStart(minDate(domainEnd, addDays(today, MAX_SPAN_DAYS)))), -1);
  const totalDays = (daysBetween(domainStart, domainEnd) ?? 0) + 1;

  const pct = (date: string, endOfDay = false): number => {
    const offset = (daysBetween(domainStart, date) ?? 0) + (endOfDay ? 1 : 0);
    return Math.min(100, Math.max(0, (offset / totalDays) * 100));
  };

  const months: { start: string; left: number }[] = [];
  for (let m = domainStart; m <= domainEnd; m = nextMonth(m)) months.push({ start: m, left: pct(m) });
  const labelEvery = Math.max(1, Math.ceil(months.length / 8));
  const todayLeft = pct(today) + 50 / totalDays;

  return (
    <SectionCard
      title="Project Timeline"
      description={
        total > GANTT_LIMIT
          ? `${GANTT_LIMIT} ongoing projects with the nearest deadlines (of ${formatNumber(total, 0)})`
          : "Ongoing projects from start to handover, nearest deadline first"
      }
      action={viewAll}
    >
      <div className="flex flex-col gap-2">
        {/* Axis */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_8.5rem]" aria-hidden="true">
          <div className="hidden md:block" />
          <div className="relative h-6 overflow-hidden border-b border-border-soft">
            {months.map((month, index) =>
              index % labelEvery === 0 ? (
                <span
                  key={month.start}
                  className="absolute bottom-1 whitespace-nowrap pl-1 text-[11px] font-medium text-muted"
                  style={{ left: `${month.left}%` }}
                >
                  {formatMonth(month.start).replace(/ \d{4}$/, (y) => (month.start.endsWith("-01-01") || index === 0 ? y : ""))}
                </span>
              ) : null,
            )}
            <span
              className={cn(
                "absolute bottom-0.5 z-10 rounded-full bg-deep px-1.5 py-0.5 text-[10px] font-semibold text-white",
                todayLeft < 6 ? "translate-x-0" : todayLeft > 94 ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${todayLeft}%` }}
            >
              Today
            </span>
          </div>
          <div className="hidden md:block" />
        </div>

        <ul className="flex flex-col">
          {bars.map((bar) => {
            const { project } = bar;
            const left = pct(bar.start);
            const right = bar.end ? pct(bar.end, true) : todayLeft;
            const width = Math.max(1.2, right - left);
            const progress = Math.min(100, Math.max(0, Number(project.progress_percentage) || 0));
            const overrunWidth =
              bar.overdue && bar.deadline && bar.deadline < today ? Math.max(0, todayLeft - pct(bar.deadline, true)) : 0;
            const description = [
              `${project.name} (${project.project_code}) for ${project.client_name}`,
              `${PROJECT_STATUS_LABELS[project.status]}, ${formatPercent(progress, 0)} complete`,
              `starts ${formatDate(bar.start)}`,
              bar.end ? `handover ${formatDate(bar.end)}` : "no handover date set",
              bar.overdue ? "overdue" : null,
            ]
              .filter(Boolean)
              .join(", ");

            return (
              <li key={project.id} className="border-b border-border-soft last:border-b-0">
                <Link
                  href={`/projects/${project.id}`}
                  aria-label={`Open project: ${description}`}
                  className="group grid grid-cols-1 items-center gap-x-2 gap-y-2 rounded-xl px-1 py-2.5 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_8.5rem]"
                >
                  <div className="flex min-w-0 items-start justify-between gap-2 md:block">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text group-hover:text-primary-strong">
                        {project.name}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {project.project_code} · {project.client_name}
                      </p>
                    </div>
                    <DeadlineBadge deadline={bar.deadline} status={project.status} size="sm" className="md:hidden" />
                  </div>

                  <div className="relative h-8 rounded-lg bg-surface-muted/60" aria-hidden="true">
                    {months.map((month) => (
                      <span
                        key={month.start}
                        className="absolute inset-y-0 w-px bg-border-soft"
                        style={{ left: `${month.left}%` }}
                      />
                    ))}
                    {overrunWidth > 0 ? (
                      <span
                        className="absolute top-1.5 h-5 rounded-r-md bg-[repeating-linear-gradient(135deg,var(--color-danger-bg)_0_5px,transparent_5px_10px)] ring-1 ring-danger/30 ring-inset"
                        style={{ left: `${todayLeft - overrunWidth}%`, width: `${overrunWidth}%` }}
                      />
                    ) : null}
                    <span
                      className={cn(
                        "absolute top-1.5 h-5 overflow-hidden rounded-md",
                        bar.overdue ? "bg-danger-bg ring-1 ring-danger/40 ring-inset" : "bg-soft-strong",
                        !bar.end && "rounded-r-none border-r-2 border-dashed border-subtle",
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      <span
                        className={cn("block h-full rounded-md", bar.overdue ? "bg-danger" : "bg-brand")}
                        style={{ width: `${progress}%` }}
                      />
                    </span>
                    <span
                      className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 rounded-full bg-deep"
                      style={{ left: `${todayLeft}%` }}
                    />
                  </div>

                  <div className="hidden flex-col items-end gap-1 md:flex">
                    <DeadlineBadge deadline={bar.deadline} status={project.status} size="sm" />
                    <span className="text-[11px] tabular-nums text-muted">
                      {bar.end ? `Handover ${formatDayMonth(bar.end)}` : "No handover date"}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted" aria-label="Timeline legend">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="flex h-3 w-8 overflow-hidden rounded bg-soft-strong">
              <span className="w-1/2 bg-brand" />
            </span>
            Planned duration (filled = progress)
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="flex h-3 w-8 overflow-hidden rounded bg-danger-bg ring-1 ring-danger/40 ring-inset">
              <span className="w-1/2 bg-danger" />
            </span>
            Overdue or delayed
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3.5 w-0.5 rounded-full bg-deep" />
            Today ({formatDayMonth(today)})
          </li>
        </ul>
      </div>
    </SectionCard>
  );
}
