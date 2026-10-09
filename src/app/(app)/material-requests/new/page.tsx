import { FolderX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { parseUuidParam, type SearchParamsRecord } from "@/lib/search-params";
import { RequestForm } from "@/features/materials/components/request-form";
import { listActiveCatalog, listCategoryNames, listRequestableProjects } from "@/features/materials/queries";

export const metadata: Metadata = { title: "New Material Request" };

type PageProps = { searchParams: Promise<SearchParamsRecord> };

export default async function NewMaterialRequestPage({ searchParams }: PageProps) {
  const user = await requireRole("owner", "site_manager");
  const params = await searchParams;
  const preselect = parseUuidParam(params, "project");

  const [projects, catalog, categories] = await Promise.all([
    listRequestableProjects(user),
    listActiveCatalog(),
    listCategoryNames(),
  ]);

  const fromProject = preselect && projects.some((p) => p.id === preselect) ? preselect : undefined;
  const back = fromProject
    ? { href: `/projects/${fromProject}?tab=requests`, label: "Back to project" }
    : { href: "/material-requests", label: "Material requests" };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        back={back}
        title="New Material Request"
        description="Tell the admin team what the site needs and by when. They are notified as soon as you submit."
      />
      {projects.length === 0 ? (
        <div className="card-surface">
          <EmptyState
            icon={FolderX}
            title="No open projects to request materials for"
            description={
              user.role === "site_manager"
                ? "You can raise requests only for active projects you're assigned to. Ask the owner to assign you to a project."
                : "Requests can be raised only for active, non-archived projects. Create or reopen a project first."
            }
            action={
              <Button asChild variant="outline">
                <Link href={user.role === "owner" ? "/projects" : "/dashboard"}>
                  {user.role === "owner" ? "Go to projects" : "Back to dashboard"}
                </Link>
              </Button>
            }
          />
        </div>
      ) : (
        <RequestForm
          mode="create"
          projects={projects.map((p) => ({ id: p.id, name: p.name, project_code: p.project_code, client_name: p.client_name }))}
          defaultProjectId={fromProject}
          catalog={catalog}
          categories={categories}
          cancelHref={back.href}
        />
      )}
    </div>
  );
}
