"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { setProjectArchivedAction } from "../actions";

export type ProjectArchiveButtonProps = { projectId: string; projectName: string; archived: boolean };

/** Archive / restore a project (owner). Archived projects keep all history. */
export function ProjectArchiveButton({ projectId, projectName, archived }: ProjectArchiveButtonProps) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline">
          {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
          {archived ? "Restore" : "Archive"}
        </Button>
      }
      title={archived ? `Restore ${projectName}?` : `Archive ${projectName}?`}
      description={
        archived
          ? "The project returns to the active project list and site managers can post updates again."
          : "Archived projects are hidden from active lists and site managers can no longer post updates or upload files. Nothing is deleted and you can restore it later."
      }
      confirmLabel={archived ? "Restore project" : "Archive project"}
      destructive={!archived}
      onConfirm={async () => {
        const result = await setProjectArchivedAction(projectId, !archived);
        if (!result.ok) return { ok: false, error: result.error };
        toast.success(result.message ?? "Saved.");
        router.refresh();
        return { ok: true };
      }}
    />
  );
}
