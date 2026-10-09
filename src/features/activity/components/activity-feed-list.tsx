import { ArrowRight, ChevronDown, FolderKanban } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/constants";
import { addDays, formatDate, formatDateTime, formatTime, isDateOnly, todayIST, toDateOnly } from "@/lib/dates";
import { formatNumber, humanize, truncate } from "@/lib/format";
import type { AppRole, Json } from "@/types/database";
import { activityHref, entityLabel, requestCode } from "../entities";
import type { ActivityChange, ActivityRow } from "../queries";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ENUM_RE = /^[a-z]+(_[a-z]+)+$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatValue(value: Json | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return formatNumber(value, 2);
  if (typeof value === "string") {
    const text: string = value;
    if (DATE_ONLY_RE.test(text) && isDateOnly(text)) return formatDate(text);
    if (TIMESTAMP_RE.test(text)) return formatDateTime(text);
    if (UUID_RE.test(text)) return `ID …${text.slice(-6)}`;
    if (ENUM_RE.test(text)) return humanize(text);
    return truncate(text, 160);
  }
  return truncate(JSON.stringify(value), 160);
}

function dayHeading(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return formatDate(day);
}

function ChangesTable({ changes }: { changes: ActivityChange[] }) {
  return (
    <details className="group mt-1 rounded-xl border border-border-soft bg-surface-muted/60">
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
      >
        <ChevronDown aria-hidden="true" className="size-3.5 transition-transform group-open:rotate-180" />
        {`Changes (${changes.length})`}
      </summary>
      <div className="overflow-x-auto px-3 pb-3">
        <table className="w-full min-w-[22rem] text-left text-xs">
          <caption className="sr-only">Changed fields</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1.5 pr-3 font-medium">Field</th>
              <th scope="col" className="py-1.5 pr-3 font-medium">Before</th>
              <th scope="col" className="sr-only">to</th>
              <th scope="col" className="py-1.5 font-medium">After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {changes.map((change) => (
              <tr key={change.field} className="align-top">
                <th scope="row" className="py-1.5 pr-3 font-medium text-text">
                  {humanize(change.field)}
                </th>
                <td className="break-words py-1.5 pr-3 text-muted line-through decoration-muted/40">
                  {formatValue(change.before)}
                </td>
                <td aria-hidden="true" className="py-1.5 pr-2 text-subtle">
                  <ArrowRight className="size-3" />
                </td>
                <td className="break-words py-1.5 font-medium text-text">{formatValue(change.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Entry({ row, viewerRole, isLast }: { row: ActivityRow; viewerRole: AppRole; isLast: boolean }) {
  const href = activityHref(row, viewerRole);
  const summary = row.summary?.trim() || `${humanize(row.action)} ${entityLabel(row.entity_type).toLowerCase()}`;
  const code = requestCode(row.metadata);
  const summaryNode: ReactNode = href ? (
    <Link
      href={href}
      className="rounded-sm hover:text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {summary}
    </Link>
  ) : (
    summary
  );

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {isLast ? null : <span aria-hidden="true" className="absolute bottom-0 left-[19px] top-11 w-px bg-border" />}
      <Avatar
        name={row.actor_name ?? "System"}
        colorSeed={row.user_id ?? undefined}
        size="md"
        decorative
        className="ring-4 ring-surface"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold text-text">{row.actor_name ?? "System"}</span>
          {row.role ? (
            <Badge tone={row.role === "owner" ? "deep" : row.role === "admin" ? "info" : "soft"} size="sm">
              {ROLE_LABELS[row.role]}
            </Badge>
          ) : null}
          <span className="text-xs text-muted">
            <time dateTime={row.created_at} title={formatDateTime(row.created_at)}>
              {formatTime(row.created_at)}
            </time>
          </span>
        </div>
        <p className="break-words text-sm leading-relaxed text-text/90">{summaryNode}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full bg-soft px-2 py-0.5 font-medium text-deep">{entityLabel(row.entity_type)}</span>
          {code ? <span className="rounded-full bg-surface-sunken px-2 py-0.5 font-medium text-muted">{code}</span> : null}
          {row.project_code && row.project_id ? (
            <Link
              href={`/projects/${row.project_id}`}
              className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 font-medium text-muted hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <FolderKanban aria-hidden="true" className="size-3" />
              {row.project_code}
              {row.project_name ? ` · ${truncate(row.project_name, 32)}` : ""}
            </Link>
          ) : null}
        </div>
        {row.changes && row.changes.length > 0 ? <ChangesTable changes={row.changes} /> : null}
      </div>
    </li>
  );
}

/** Activity log grouped by IST day, with an expandable before/after diff for the owner. */
export function ActivityFeedList({ rows, viewerRole }: { rows: readonly ActivityRow[]; viewerRole: AppRole }) {
  const today = todayIST();
  const groups: { day: string; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const day = toDateOnly(row.created_at) ?? "unknown";
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const heading = group.day === "unknown" ? "Undated" : dayHeading(group.day, today);
        return (
          <section key={group.day} aria-label={heading}>
            <h3 className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {group.day === "unknown" ? heading : <time dateTime={group.day}>{heading}</time>}
              <span aria-hidden="true" className="h-px flex-1 bg-border-soft" />
              <span className="font-medium normal-case tracking-normal">{`${group.rows.length} ${group.rows.length === 1 ? "entry" : "entries"}`}</span>
            </h3>
            <ol className="flex flex-col">
              {group.rows.map((row, index) => (
                <Entry key={row.id} row={row} viewerRole={viewerRole} isLast={index === group.rows.length - 1} />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
