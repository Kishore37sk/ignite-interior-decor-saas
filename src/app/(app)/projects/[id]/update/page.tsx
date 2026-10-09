import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeadlineBadge } from "@/components/shared/deadline-badge";
import { PageHeader } from "@/components/shared/page-header";
import { ProgressBar } from "@/components/shared/progress-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { isClosedProjectStatus } from "@/lib/constants";
import { formatDate, relativeTime } from "@/lib/dates";
import { uuid } from "@/lib/validation/common";
import { ProjectUpdateForm } from "@/features/projects/components/project-update-form";
import { getProject, getProjectMilestones } from "@/features/projects/queries";

export const metadata: Metadata = { title: "Update Progress" };

type PageProps = { params: Promise<{ id: string }> };

export default async function ProjectUpdatePage({ params }: PageProps) {
  const user = await requireRole("owner", "site_manager");
  const { id: rawId } = await params;
  const id = uuid.safeParse(rawId);
  if (!id.success) notFound();

  const project = await getProject(id.data);
  if (!project) notFound();
  const isOwner = user.role === "owner";
  // RLS already limits site managers to projects they can access; updates need an active SM membership.
  if (!isOwner && !project.site_manager_ids.includes(user.id)) notFound();

  const closed = isClosedProjectStatus(project.status) || Boolean(project.archived_at);
  const blocked = !isOwner && closed;
  const milestones = blocked ? [] : await getProjectMilestones(project.id);
  const currentMilestone =
    project.current_milestone ??
    milestones.find((m) => m.status === "in_progress")?.name ??
    milestones.find((m) => m.status === "not_started")?.name ??
    "";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader
        title="Update Progress"
        back={{ href: `/projects/${project.id}`, label: "Back to project" }}
        breadcrumbs={[
          { label: isOwner ? "Projects" : "My Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Update" },
        ]}
      />

      <section aria-label="Project summary" className="card-surface flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">
              {project.project_code} · {project.client_name}
            </p>
            <p className="text-base font-semibold text-text">{project.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {project.archived_at ? <Badge tone="muted" size="sm">Archived</Badge> : null}
            <StatusBadge kind="project" value={project.status} size="sm" />
          </div>
        </div>
        <ProgressBar value={project.progress_percentage} label="Current progress" showLabel state={project.deadline_state} />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">
            Due <span className="font-medium tabular-nums text-text">{formatDate(project.deadline_date)}</span>
          </span>
          <DeadlineBadge deadline={project.deadline_date} status={project.status} size="sm" />
        </div>
        {project.last_update_at ? (
          <p className="text-xs text-muted">Last update {relativeTime(project.last_update_at)}</p>
        ) : (
          <p className="text-xs text-muted">No progress updates yet.</p>
        )}
      </section>

      {blocked ? (
        <div className="card-surface">
          <EmptyState
            icon={Lock}
            title="Updates are closed for this project"
            description={
              project.archived_at
                ? "This project is archived. Ask the owner to restore it before posting updates."
                : `This project is ${project.status === "completed" ? "completed" : "cancelled"}. Ask the owner to reopen it if more work is needed.`
            }
            action={
              <Button variant="outline" asChild>
                <Link href={`/projects/${project.id}`}>Back to project</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <ProjectUpdateForm
          projectId={project.id}
          allowCancel={isOwner}
          milestones={milestones.map((m) => m.name)}
          startDate={project.start_date}
          defaults={{
            status: project.status,
            progress: Number(project.progress_percentage ?? 0),
            milestone: currentMilestone,
            expectedCompletion: project.expected_completion_date ?? "",
          }}
        />
      )}
    </div>
  );
}
