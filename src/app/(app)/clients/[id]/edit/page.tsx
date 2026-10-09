import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { toFriendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { ClientForm } from "@/features/clients/components/client-form";

export const metadata: Metadata = { title: "Edit Client" };

type PageProps = { params: Promise<{ id: string }> };

export default async function EditClientPage({ params }: PageProps) {
  await requireRole("owner");
  const { id: rawId } = await params;
  const id = uuid.safeParse(rawId);
  if (!id.success) notFound();

  const supabase = await createClient();
  const { data: client, error } = await supabase.from("clients").select("*").eq("id", id.data).maybeSingle();
  if (error) throw new Error(toFriendlyError(error, "We couldn't load this client.", "clients.edit.load"));
  if (!client) notFound();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={`Edit ${client.name}`}
        meta={
          <>
            <Badge tone="outline">{client.client_code}</Badge>
            {client.archived_at ? <Badge tone="muted">Archived</Badge> : null}
          </>
        }
        back={{ href: `/clients/${client.id}`, label: "Back to client" }}
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Clients", href: "/clients" },
          { label: client.name, href: `/clients/${client.id}` },
          { label: "Edit" },
        ]}
      />
      <ClientForm
        mode="edit"
        clientId={client.id}
        cancelHref={`/clients/${client.id}`}
        defaults={{
          name: client.name,
          email: client.email ?? "",
          phone: client.phone ?? "",
          alternate_phone: client.alternate_phone ?? "",
          address: client.address ?? "",
          city: client.city ?? "",
          state: client.state ?? "",
          country: client.country ?? "India",
          notes: client.notes ?? "",
        }}
      />
    </div>
  );
}
