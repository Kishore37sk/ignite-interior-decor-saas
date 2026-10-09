import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requireRole } from "@/lib/auth";
import { parseUuidParam, type SearchParamsRecord } from "@/lib/search-params";
import { listActiveClientOptions } from "@/features/clients/queries";
import { ProjectForm } from "@/features/projects/components/project-form";
import { listTeamOptions } from "@/features/projects/queries";

export const metadata: Metadata = { title: "New Project" };

type PageProps = { searchParams: Promise<SearchParamsRecord> };

export default async function NewProjectPage({ searchParams }: PageProps) {
  await requireRole("owner");
  const params = await searchParams;
  const preselected = parseUuidParam(params, "client");
  const [clients, siteManagers] = await Promise.all([listActiveClientOptions(), listTeamOptions(["site_manager"])]);
  const preselectedClient = clients.find((c) => c.id === preselected);
  const cancelHref = preselectedClient ? `/clients/${preselectedClient.id}` : "/projects";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="New Project"
        back={{ href: cancelHref, label: preselectedClient ? `Back to ${preselectedClient.name}` : "Back to projects" }}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Projects", href: "/projects" },
          { label: "New Project" },
        ]}
        description="Default milestones (Project Started → Completed) are created automatically."
      />
      <ProjectForm
        mode="create"
        clients={clients}
        siteManagers={siteManagers.map((sm) => ({
          id: sm.id,
          label: sm.employee_id ? `${sm.full_name} (${sm.employee_id})` : sm.full_name,
        }))}
        cancelHref={cancelHref}
        defaults={{
          client_id: preselectedClient?.id ?? "",
          name: "",
          project_code: "",
          project_type: "",
          site_address: "",
          city: preselectedClient?.city ?? "",
          start_date: "",
          expected_completion_date: "",
          handover_date: "",
          actual_handover_date: "",
          status: "planning",
          priority: "medium",
          progress_percentage: "0",
          notes: "",
          project_cost: "",
          advance_received: "",
          site_manager_id: "",
        }}
      />
    </div>
  );
}
