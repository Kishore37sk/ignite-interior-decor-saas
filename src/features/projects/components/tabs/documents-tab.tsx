import type { CurrentUser } from "@/lib/auth";
import { listProjectDocuments } from "../../queries";
import { ProjectDocuments } from "../project-documents";

export type DocumentsTabProps = {
  projectId: string;
  user: CurrentUser;
  canUpload: boolean;
  uploadNote?: string | null;
};

/** Project documents grouped by category (signed thumbnails, upload, download, archive). */
export async function DocumentsTab({ projectId, user, canUpload, uploadNote }: DocumentsTabProps) {
  const documents = await listProjectDocuments(projectId, user);
  return (
    <ProjectDocuments
      projectId={projectId}
      documents={documents}
      canUpload={canUpload}
      uploadNote={uploadNote}
      canArchive={user.role === "owner"}
    />
  );
}
