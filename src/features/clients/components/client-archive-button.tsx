"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { setClientArchivedAction } from "../actions";

export type ClientArchiveButtonProps = {
  clientId: string;
  clientName: string;
  archived: boolean;
  activeProjectCount: number;
};

/** Archive / restore a client (soft delete via `archived_at`; clients are never deleted). */
export function ClientArchiveButton({ clientId, clientName, archived, activeProjectCount }: ClientArchiveButtonProps) {
  const router = useRouter();

  async function onConfirm() {
    const result = await setClientArchivedAction(clientId, !archived);
    if (!result.ok) return { ok: false, error: result.error };
    toast.success(result.message ?? (archived ? "Client restored." : "Client archived."));
    router.refresh();
    return { ok: true };
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline">
          {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
          {archived ? "Restore" : "Archive"}
        </Button>
      }
      title={archived ? `Restore ${clientName}?` : `Archive ${clientName}?`}
      description={
        archived
          ? "The client will appear in the active client list again."
          : activeProjectCount > 0
            ? `This client still has ${activeProjectCount} active project${activeProjectCount === 1 ? "" : "s"}. Archiving hides the client from the active list but keeps all projects, requests and history.`
            : "Archiving hides the client from the active list. Projects, requests and history are kept, and you can restore the client at any time."
      }
      confirmLabel={archived ? "Restore client" : "Archive client"}
      destructive={!archived}
      onConfirm={onConfirm}
    />
  );
}
