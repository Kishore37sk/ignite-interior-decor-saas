import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  FolderKanban,
  FolderPlus,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  PhoneCall,
  StickyNote,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import { CurrencyText } from "@/components/shared/currency-text";
import { DeadlineBadge } from "@/components/shared/deadline-badge";
import { InfoList, InfoRow } from "@/components/shared/info-row";
import { MaterialRequestCard } from "@/components/shared/material-request-card";
import { PageHeader } from "@/components/shared/page-header";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { formatWorkScope } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { logServerError, toFriendlyError } from "@/lib/errors";
import { formatINR, pluralize } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { ClientArchiveButton } from "@/features/clients/components/client-archive-button";
import { MilestoneStrip, type StripMilestone } from "@/features/projects/components/milestone-strip";
import { listActivity, listRequests, toActivityItems } from "@/features/projects/queries";

export const metadata: Metadata = { title: "Client" };

type PageProps = { params: Promise<{ id: string }> };

const REQUEST_PREVIEW = 6;

export default async function ClientDetailPage({ params }: PageProps) {
  const user = await requireRole("owner", "site_manager");
  const isOwner = user.role === "owner";
  const { id: rawId } = await params;
  const id = uuid.safeParse(rawId);
  if (!id.success) notFound();

  const supabase = await createClient();
  const [clientResult, projectsResult] = await Promise.all([
    supabase.from("client_directory").select("*").eq("id", id.data).maybeSingle(),
    supabase
      .from("project_directory")
      .select("*")
      .eq("client_id", id.data)
      .order("archived_at", { ascending: false, nullsFirst: true })
      .order("start_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (clientResult.error) {
    throw new Error(toFriendlyError(clientResult.error, "We couldn't load this client.", "clients.detail"));
  }
  const client = clientResult.data;
  if (!client) notFound();
  if (projectsResult.error) {
    throw new Error(toFriendlyError(projectsResult.error, "We couldn't load this client's projects.", "clients.detail.projects"));
  }
  const projects = projectsResult.data ?? [];
  const projectIds = projects.map((p) => p.id);

  const [milestonesResult, financialsResult, requests, activity] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("project_milestones")
          .select("id, project_id, name, status, sort_order")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    isOwner
      ? supabase
          .from("project_financial_summary")
          .select("project_id, project_cost, advance_received, material_estimated_cost, material_actual_cost")
          .eq("client_id", client.id)
      : Promise.resolve({ data: [], error: null }),
    listRequests({ column: "client_id", value: client.id }, { page: 1, pageSize: REQUEST_PREVIEW, withCosts: isOwner }),
    listActivity({ projectIds, clientId: isOwner ? client.id : undefined }, 15),
  ]);
  if (milestonesResult.error) logServerError("clients.detail.milestones", milestonesResult.error);
  if (financialsResult.error) logServerError("clients.detail.financials", financialsResult.error);

  const milestonesByProject = new Map<string, StripMilestone[]>();
  for (const m of milestonesResult.data ?? []) {
    const list = milestonesByProject.get(m.project_id) ?? [];
    list.push(m);
    milestonesByProject.set(m.project_id, list);
  }
  const financials = new Map((financialsResult.data ?? []).map((f) => [f.project_id, f]));
  const totalValue = (financialsResult.data ?? []).reduce((sum, f) => sum + Number(f.project_cost ?? 0), 0);
  const openRequests = projects.reduce((sum, p) => sum + (p.open_material_requests ?? 0), 0);
  const siteManagers = Array.from(
    new Map(
      projects
        .filter((p) => p.site_manager_id && p.site_manager_name && !p.archived_at)
        .map((p) => [p.site_manager_id as string, { id: p.site_manager_id as string, name: p.site_manager_name as string, projects: [] as string[] }]),
    ).values(),
  );
  for (const sm of siteManagers) {
    sm.projects = projects.filter((p) => p.site_manager_ids.includes(sm.id) && !p.archived_at).map((p) => p.name);
  }
  const archived = Boolean(client.archived_at);
  const location = [client.city, client.state, client.country].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={client.name}
        meta={
          <>
            <Badge tone="outline">{client.client_code}</Badge>
            {archived ? <Badge tone="muted">Archived</Badge> : null}
          </>
        }
        back={{ href: "/clients", label: "Back to clients" }}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Clients", href: "/clients" },
          { label: client.name },
        ]}
        actions={
          isOwner ? (
            <>
              <ClientArchiveButton
                clientId={client.id}
                clientName={client.name}
                archived={archived}
                activeProjectCount={client.active_project_count}
              />
              <Button variant="secondary" asChild>
                <Link href={`/clients/${client.id}/edit`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
              {archived ? null : (
                <Button asChild>
                  <Link href={`/projects/new?client=${client.id}`}>
                    <FolderPlus aria-hidden="true" />
                    New Project
                  </Link>
                </Button>
              )}
            </>
          ) : null
        }
      />

      {archived ? (
        <p role="status" className="rounded-2xl border border-border-soft bg-surface-muted px-4 py-3 text-sm text-muted">
          This client was archived on {formatDate(client.archived_at)}. Restore the client to add new projects.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        {/* Left column: identity + contact */}
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="client-info-title" className="card-surface flex flex-col gap-5 p-5 sm:p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar name={client.name} colorSeed={client.id} size="2xl" decorative className="rounded-2xl" />
              <div>
                <h2 id="client-info-title" className="text-xl font-semibold text-text">
                  {client.name}
                </h2>
                <p className="text-sm text-muted">{location || "Location not set"}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Badge tone="muted">{client.client_code}</Badge>
                {archived ? (
                  <Badge tone="muted">Archived</Badge>
                ) : client.active_project_count > 0 ? (
                  <Badge tone="success">Active</Badge>
                ) : (
                  <Badge tone="soft">No active projects</Badge>
                )}
              </div>
            </div>
            <InfoList>
              <InfoRow icon={Phone} label="Phone" value={client.phone ? <a className="hover:underline" href={`tel:${client.phone}`}>{client.phone}</a> : null} />
              <InfoRow
                icon={PhoneCall}
                label="Alternate phone"
                value={client.alternate_phone ? <a className="hover:underline" href={`tel:${client.alternate_phone}`}>{client.alternate_phone}</a> : null}
              />
              <InfoRow icon={Mail} label="Email" value={client.email ? <a className="break-all hover:underline" href={`mailto:${client.email}`}>{client.email}</a> : null} />
              <InfoRow
                icon={MapPin}
                label="Address"
                value={client.address || location ? [client.address, location].filter(Boolean).join(", ") : null}
              />
              <InfoRow icon={CalendarClock} label="Client since" value={formatDate(client.created_at)} />
            </InfoList>
            {client.notes ? (
              <div className="rounded-xl bg-surface-muted p-4">
                <p className="flex items-center gap-2 text-xs font-medium text-muted">
                  <StickyNote aria-hidden="true" className="size-3.5" />
                  Notes
                </p>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-text">{client.notes}</p>
              </div>
            ) : null}
          </section>

          <SectionCard title="Site Manager" description="Assigned to this client's active projects.">
            {siteManagers.length === 0 ? (
              <p className="text-sm text-muted">
                {projects.length === 0 ? "No projects yet." : "No site manager is assigned to the active projects."}
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {siteManagers.map((sm) => (
                  <li key={sm.id} className="flex min-w-0 items-center gap-3">
                    <Avatar name={sm.name} colorSeed={sm.id} size="md" decorative />
                    <div className="min-w-0">
                      {isOwner ? (
                        <Link href={`/site-managers/${sm.id}`} className="font-medium text-text hover:text-primary-strong hover:underline">
                          {sm.name}
                        </Link>
                      ) : (
                        <p className="font-medium text-text">{sm.name}</p>
                      )}
                      <p className="truncate text-xs text-muted">{sm.projects.join(", ")}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="flex min-w-0 flex-col gap-6">
          <div className={`grid grid-cols-2 gap-4 ${isOwner ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            <StatCard label="Projects" value={client.project_count} unit={client.project_count === 1 ? "project" : "projects"} icon={FolderKanban} />
            <StatCard label="Active" value={client.active_project_count} unit="ongoing" icon={CalendarCheck} />
            <StatCard
              label="Open requests"
              value={openRequests}
              unit="material"
              icon={Package}
              href={projects.length > 0 ? `/material-requests?client=${client.id}&view=open` : undefined}
            />
            {isOwner ? (
              <StatCard label="Total value" value={formatINR(totalValue, { compact: true })} icon={Wallet} sub="All projects" />
            ) : null}
          </div>

          <SectionCard
            title="Projects"
            description={projects.length > 0 ? pluralize(projects.length, "project") : undefined}
            action={
              isOwner && !archived ? (
                <Button size="sm" variant="secondary" asChild>
                  <Link href={`/projects/new?client=${client.id}`}>
                    <FolderPlus aria-hidden="true" />
                    New Project for this client
                  </Link>
                </Button>
              ) : null
            }
          >
            {projects.length === 0 ? (
              <EmptyState
                compact
                icon={FolderKanban}
                title="No projects yet"
                description={
                  isOwner
                    ? "Create the first project for this client to track progress, deadlines and materials."
                    : "There are no projects you can view for this client."
                }
                action={
                  isOwner && !archived ? (
                    <Button asChild>
                      <Link href={`/projects/new?client=${client.id}`}>
                        <FolderPlus aria-hidden="true" />
                        New Project
                      </Link>
                    </Button>
                  ) : null
                }
              />
            ) : (
              <ul className="flex flex-col gap-4">
                {projects.map((project) => {
                  const fin = financials.get(project.id);
                  return (
                    <li
                      key={project.id}
                      className="relative flex min-w-0 flex-col gap-4 rounded-2xl border border-border-soft p-4 transition-colors hover:border-primary/30 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted">
                            {project.project_code}
                            {project.project_type ? ` · ${project.project_type}` : ""}
                            {formatWorkScope(project.work_scope) ? ` · ${formatWorkScope(project.work_scope)}` : ""}
                            {project.city ? ` · ${project.city}` : ""}
                          </p>
                          <h3 className="mt-0.5 text-base font-semibold text-text">
                            <Link
                              href={`/projects/${project.id}`}
                              className="after:absolute after:inset-0 after:rounded-2xl hover:text-primary-strong focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-primary"
                            >
                              {project.name}
                            </Link>
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {project.archived_at ? <Badge tone="muted" size="sm">Archived</Badge> : null}
                          <PriorityBadge value={project.priority} size="sm" />
                          <StatusBadge kind="project" value={project.status} size="sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <ProgressBar
                          value={project.progress_percentage}
                          label={`${project.name} progress`}
                          showLabel
                          state={project.deadline_state}
                        />
                        <MilestoneStrip milestones={milestonesByProject.get(project.id) ?? []} />
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Start</dt>
                          <dd className="font-medium tabular-nums text-text">{formatDate(project.start_date)}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Expected completion</dt>
                          <dd className="font-medium tabular-nums text-text">{formatDate(project.expected_completion_date)}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Handover</dt>
                          <dd className="font-medium tabular-nums text-text">{formatDate(project.handover_date)}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Deadline</dt>
                          <dd>
                            <DeadlineBadge deadline={project.deadline_date} status={project.status} size="sm" />
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Site manager</dt>
                          <dd className={project.site_manager_name ? "truncate font-medium text-text" : "font-medium text-warning-text"}>
                            {project.site_manager_name ?? "Not assigned"}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Material requests</dt>
                          <dd className="font-medium tabular-nums text-text">
                            {project.open_material_requests} open
                            <span className="font-normal text-muted"> / {project.total_material_requests}</span>
                          </dd>
                        </div>
                        {isOwner ? (
                          <>
                            <div className="min-w-0">
                              <dt className="text-xs text-muted">Project cost</dt>
                              <dd className="font-medium text-text">
                                <CurrencyText value={fin?.project_cost ?? null} />
                              </dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-xs text-muted">Material cost (actual)</dt>
                              <dd className="font-medium text-text">
                                <CurrencyText value={fin?.material_actual_cost ?? null} />
                              </dd>
                            </div>
                          </>
                        ) : null}
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title="Material Requirements"
            description={
              requests.total > 0
                ? requests.total > REQUEST_PREVIEW
                  ? `Latest ${REQUEST_PREVIEW} of ${requests.total} requests`
                  : pluralize(requests.total, "request")
                : undefined
            }
            action={
              projects.length > 0 && requests.total > 0 ? (
                <Button size="sm" variant="ghost" asChild>
                  <Link href={`/material-requests?client=${client.id}`}>
                    View all
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : null
            }
          >
            {requests.rows.length === 0 ? (
              <EmptyState
                compact
                icon={Package}
                title="No material requests"
                description="Material requests raised for this client's projects will appear here."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {requests.rows.map((request) => (
                  <MaterialRequestCard key={request.id} request={request} showCost={isOwner} />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Activity" description="Recent changes across this client's projects.">
            <ActivityTimeline
              items={toActivityItems(activity.rows)}
              emptyDescription="Project updates, assignments and material requests will appear here."
            />
            {projects.length === 1 && projects[0] && activity.hasMore ? (
              <div className="mt-4 flex justify-center">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/projects/${projects[0].id}?tab=activity`}>
                    View full project activity
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ) : null}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
