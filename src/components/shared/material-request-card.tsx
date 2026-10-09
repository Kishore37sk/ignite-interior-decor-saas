import { Boxes, UserRound } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { MaterialRequestDirectoryRow } from "@/types/database";
import { CurrencyText } from "./currency-text";
import { PriorityBadge } from "./priority-badge";
import { RequiredDateBadge } from "./required-date-badge";
import { StatusBadge } from "./status-badge";

export type MaterialRequestCardData = Pick<
  MaterialRequestDirectoryRow,
  "id" | "request_code" | "title" | "project_name" | "status" | "priority" | "required_date"
> &
  Partial<
    Pick<
      MaterialRequestDirectoryRow,
      | "project_code"
      | "client_name"
      | "items_summary"
      | "item_count"
      | "requested_by_name"
      | "assigned_admin_name"
      | "estimated_cost"
      | "approved_cost"
      | "actual_cost"
    >
  >;

export type MaterialRequestCardProps = {
  request: MaterialRequestCardData;
  /** Defaults to `/material-requests/<id>`. */
  href?: string;
  /** Show the best-known cost (actual → approved → estimated). */
  showCost?: boolean;
  className?: string;
};

/** Material request summary: code, title, project, items, required-date urgency, status. */
export function MaterialRequestCard({ request, href, showCost = false, className }: MaterialRequestCardProps) {
  const cost = request.actual_cost ?? request.approved_cost ?? request.estimated_cost ?? null;
  const costLabel =
    request.actual_cost != null ? "Actual" : request.approved_cost != null ? "Approved" : "Estimated";

  return (
    <article
      className={cn(
        "card-surface relative flex min-w-0 flex-col gap-3 p-5 transition-[box-shadow,border-color] duration-200",
        "hover:border-primary/30 hover:shadow-pop",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">
            {request.request_code}
            {request.project_code ? ` · ${request.project_code}` : ""}
          </p>
          <h3 className="mt-1 line-clamp-2 text-base font-semibold text-text">
            <Link
              href={href ?? `/material-requests/${request.id}`}
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-primary"
            >
              {request.title}
            </Link>
          </h3>
          <p className="truncate text-sm text-muted">
            {request.project_name}
            {request.client_name ? ` · ${request.client_name}` : ""}
          </p>
        </div>
        <StatusBadge kind="material" value={request.status} className="shrink-0" />
      </div>

      {request.items_summary ? (
        <p className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-text">
          <Boxes aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-strong" />
          <span className="line-clamp-2 min-w-0">
            {request.items_summary}
            {request.item_count && request.item_count > 1 ? (
              <span className="text-muted"> · {request.item_count} items</span>
            ) : null}
          </span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <RequiredDateBadge requiredDate={request.required_date} status={request.status} />
        <PriorityBadge value={request.priority} />
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-border-soft pt-3 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted">Required by</dt>
          <dd className="font-medium tabular-nums text-text">{formatDate(request.required_date)}</dd>
        </div>
        {showCost ? (
          <div className="min-w-0">
            <dt className="text-xs text-muted">{`${costLabel} cost`}</dt>
            <dd className="font-medium text-text">
              <CurrencyText value={cost} />
            </dd>
          </div>
        ) : request.assigned_admin_name !== undefined ? (
          <div className="min-w-0">
            <dt className="text-xs text-muted">Assigned to</dt>
            <dd className={cn("truncate font-medium", request.assigned_admin_name ? "text-text" : "text-muted")}>
              {request.assigned_admin_name ?? "Unassigned"}
            </dd>
          </div>
        ) : null}
        {request.requested_by_name ? (
          <div className="col-span-2 flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <UserRound aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">
              Requested by <span className="font-medium text-text">{request.requested_by_name}</span>
            </span>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
