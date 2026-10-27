import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { uuid } from "@/lib/validation/common";
import { listActiveClientOptions } from "@/features/clients/queries";
import { ProjectForm } from "@/features/projects/components/project-form";
import { getProject, getProjectFinancials, listTeamOptions, resolvePeople } from "@/features/projects/queries";

export const metadata: Metadata = { title: "Edit Project" };

type PageProps = { params: Promise<{ id: string }> };

function numberText(value: number | null | undefined): string {
  return value === null || value === undefined || Number(value) === 0 ? "" : String(value);
}

export default async function EditProjectPage({ params }: PageProps) {
  const user = await requireRole("owner");
  const { id: rawId } = await params;
  const id = uuid.safeParse(rawId);
  if (!id.success) notFound();

  const project = await getProject(id.data);
  if (!project) notFound();
  const [clients, siteManagers, financials] = await Promise.all([
    listActiveClientOptions(),
    listTeamOptions(["site_manager"]),
    getProjectFinancials(project.id),
  ]);

  // Keep the current client / site manager selectable even if archived or inactive.
  const clientOptions = clients.some((c) => c.id === project.client_id)
    ? clients
    : [{ id: project.client_id, name: `${project.client_name} (archived)`, client_code: project.client_code, city: null }, ...clients];
  const smOptions = siteManagers.map((sm) => ({
    id: sm.id,
    label: sm.employee_id ? `${sm.full_name} (${sm.employee_id})` : sm.full_name,
  }));
  const currentSm = project.site_manager_id;
  if (currentSm && !smOptions.some((o) => o.id === currentSm)) {
    const people = await resolvePeople([currentSm], user);
    smOptions.unshift({ id: currentSm, label: `${people.get(currentSm)?.name ?? project.site_manager_name ?? "Current site manager"} (inactive)` });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={`Edit ${project.name}`}
        meta={
          <>
            <Badge tone="outline">{project.project_code}</Badge>
            {project.archived_at ? <Badge tone="muted">Archived</Badge> : null}
          </>
        }
        back={{ href: `/projects/${project.id}`, label: "Back to project" }}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Edit" },
        ]}
      />
      <ProjectForm
        mode="edit"
        projectId={project.id}
        clients={clientOptions}
        siteManagers={smOptions}
        cancelHref={`/projects/${project.id}`}
        receivedSoFar={Number(financials?.advance_received ?? 0)}
        defaults={{
          client_id: project.client_id,
          name: project.name,
          project_code: project.project_code,
          project_type: project.project_type ?? "",
          site_address: project.site_address ?? "",
          city: project.city ?? "",
          start_date: project.start_date ?? "",
          expected_completion_date: project.expected_completion_date ?? "",
          handover_date: project.handover_date ?? "",
          actual_handover_date: project.actual_handover_date ?? "",
          status: project.status,
          priority: project.priority,
          progress_percentage: String(project.progress_percentage ?? 0),
          notes: project.notes ?? "",
          project_cost: numberText(financials?.project_cost),
          advance_received: "",
          site_manager_id: currentSm ?? "",
        }}
      />
    </div>
  );
}
