import { CalendarCheck, FolderKanban, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/dates";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClientDirectoryRow } from "@/types/database";
import { ProgressBar } from "./progress-bar";
import { StatusBadge } from "./status-badge";

export type ClientCardData = Pick<ClientDirectoryRow, "id" | "name" | "client_code"> &
  Partial<
    Pick<
      ClientDirectoryRow,
      | "city"
      | "project_count"
      | "active_project_count"
      | "latest_project_name"
      | "latest_project_status"
      | "latest_progress"
      | "latest_handover_date"
      | "site_manager_name"
      | "archived_at"
    >
  >;

export type ClientCardProps = {
  client: ClientCardData;
  /** Defaults to `/clients/<id>`. */
  href?: string;
  className?: string;
};

/** Client summary card: identity, latest project status/progress, handover and site manager. */
export function ClientCard({ client, href, className }: ClientCardProps) {
  const archived = Boolean(client.archived_at);
  return (
    <article
      className={cn(
        "card-surface relative flex min-w-0 flex-col gap-4 p-5 transition-[box-shadow,border-color] duration-200",
        "hover:border-primary/30 hover:shadow-pop",
        archived && "opacity-80",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar name={client.name} colorSeed={client.id} size="lg" decorative />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-text">
            <Link
              href={href ?? `/clients/${client.id}`}
              className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-primary"
            >
              {client.name}
            </Link>
          </h3>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>{client.client_code}</span>
            {client.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="size-3" />
                {client.city}
              </span>
            ) : null}
          </p>
        </div>
        {archived ? (
          <Badge tone="muted" size="sm">
            Archived
          </Badge>
        ) : null}
      </div>

      {client.latest_project_name ? (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-text">
              <FolderKanban aria-hidden="true" className="size-4 shrink-0 text-primary-strong" />
              <span className="truncate">{client.latest_project_name}</span>
            </p>
            {client.latest_project_status ? (
              <StatusBadge kind="project" value={client.latest_project_status} size="sm" />
            ) : null}
          </div>
          {client.latest_progress !== undefined && client.latest_progress !== null ? (
            <ProgressBar value={client.latest_progress} label={`${client.latest_project_name} progress`} size="sm" />
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl bg-surface-muted p-3 text-sm text-muted">No projects yet</p>
      )}

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted">Projects</dt>
          <dd className="font-medium tabular-nums text-text">
            {pluralize(client.project_count ?? 0, "project")}
            {client.active_project_count ? (
              <span className="font-normal text-muted"> · {client.active_project_count} active</span>
            ) : null}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-xs text-muted">
            <CalendarCheck aria-hidden="true" className="size-3" />
            Handover
          </dt>
          <dd className="truncate font-medium tabular-nums text-text">{formatDate(client.latest_handover_date)}</dd>
        </div>
        {client.site_manager_name !== undefined ? (
          <div className="col-span-2 min-w-0">
            <dt className="flex items-center gap-1 text-xs text-muted">
              <UserRound aria-hidden="true" className="size-3" />
              Site manager
            </dt>
            <dd className={cn("truncate font-medium", client.site_manager_name ? "text-text" : "text-muted")}>
              {client.site_manager_name ?? "Not assigned"}
            </dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}
