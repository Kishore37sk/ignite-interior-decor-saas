import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { requireRole } from "@/lib/auth";
import { ClientForm } from "@/features/clients/components/client-form";

export const metadata: Metadata = { title: "Add Client" };

export default async function NewClientPage() {
  await requireRole("owner");
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Add Client"
        back={{ href: "/clients", label: "Back to clients" }}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Clients", href: "/clients" },
          { label: "Add Client" },
        ]}
        description="A client code (CL-0001…) is generated automatically. You can add projects for this client next."
      />
      <ClientForm mode="create" cancelHref="/clients" />
    </div>
  );
}
