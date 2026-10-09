"use client";

import {
  Archive,
  Camera,
  CircleCheck,
  CircleX,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS, PROJECT_DOCUMENTS_BUCKET } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { formatFileSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { DocumentCategory } from "@/types/database";
import {
  archiveProjectDocumentAction,
  getDocumentDownloadUrlAction,
  registerProjectDocumentAction,
} from "../actions";
import { PROJECT_DOCUMENT_ACCEPT, PROJECT_DOCUMENT_MAX_BYTES, PROJECT_DOCUMENT_MIME_TYPES } from "../constants";
import type { ProjectDocumentItem } from "../queries";

export type ProjectDocumentsProps = {
  projectId: string;
  documents: readonly ProjectDocumentItem[];
  /** Owner or assigned site manager on an open project. */
  canUpload: boolean;
  /** Shown instead of the upload panel when uploads are not allowed. */
  uploadNote?: string | null;
  /** Owner only. */
  canArchive: boolean;
};

type UploadState = "uploading" | "saving" | "done" | "error";
type UploadItem = { key: string; name: string; size: number; progress: number; state: UploadState; error?: string };

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "heic",
  "heif",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "dwg",
  "dxf",
]);

const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  dwg: "image/vnd.dwg",
  dxf: "image/vnd.dxf",
};

const ALLOWED_MIME: ReadonlySet<string> = new Set(PROJECT_DOCUMENT_MIME_TYPES);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Storage-safe file name: letters, numbers, dot, dash, underscore (max 100 chars). */
function safeFileName(name: string): string {
  const ext = extensionOf(name);
  const base = (ext ? name.slice(0, -(ext.length + 1)) : name)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 90);
  return `${base || "file"}${ext ? `.${ext.replace(/[^a-z0-9]/g, "")}` : ""}`;
}

function contentTypeFor(file: File): string {
  if (file.type && ALLOWED_MIME.has(file.type)) return file.type;
  return EXTENSION_MIME[extensionOf(file.name)] ?? "application/octet-stream";
}

function validateFile(file: File): string | null {
  if (file.size === 0) return "This file is empty.";
  if (file.size > PROJECT_DOCUMENT_MAX_BYTES) return "Files can be at most 25 MB.";
  const ext = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext) && !(file.type && ALLOWED_MIME.has(file.type) && file.type !== "application/octet-stream")) {
    return "Use images, PDF, Word, Excel, CSV, text or CAD (DWG/DXF) files.";
  }
  return null;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Uploads straight to Supabase Storage (private bucket) with upload progress events. */
function uploadWithProgress(
  path: string,
  file: File,
  contentType: string,
  accessToken: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) return Promise.reject(new Error("config"));
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${baseUrl.replace(/\/$/, "")}/storage/v1/object/${PROJECT_DOCUMENTS_BUCKET}/${encodedPath}`);
    xhr.setRequestHeader("authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.status === 413 ? "too_large" : xhr.status === 403 || xhr.status === 401 ? "forbidden" : "failed"));
    };
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

function uploadErrorMessage(err: unknown): string {
  const code = err instanceof Error ? err.message : "";
  switch (code) {
    case "too_large":
      return "Files can be at most 25 MB.";
    case "forbidden":
      return "You don't have permission to upload to this project.";
    case "network":
      return "Upload failed — check your connection and try again.";
    case "config":
      return "Uploads aren't configured yet. Ask the owner to check the app settings.";
    default:
      return "Upload failed. This file type may not be allowed.";
  }
}

function FileIcon({ mimeType, className }: { mimeType: string | null; className?: string }) {
  const Icon = mimeType?.startsWith("image/")
    ? FileImage
    : mimeType && /sheet|excel|csv/.test(mimeType)
      ? FileSpreadsheet
      : FileText;
  return <Icon aria-hidden="true" className={className} />;
}

/** Project documents: grouped list with thumbnails, upload (incl. camera capture), download and archive. */
export function ProjectDocuments({ projectId, documents, canUpload, uploadNote, canArchive }: ProjectDocumentsProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const categoryId = useId();
  const [category, setCategory] = useState<DocumentCategory>("photos");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function patch(key: string, next: Partial<UploadItem>) {
    setUploads((list) => list.map((item) => (item.key === key ? { ...item, ...next } : item)));
  }

  async function uploadFiles(files: File[], targetCategory: DocumentCategory) {
    if (files.length === 0) return;
    const items: (UploadItem & { file: File })[] = files.map((file) => {
      const problem = validateFile(file);
      return {
        key: newId(),
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        state: problem ? "error" : "uploading",
        error: problem ?? undefined,
      };
    });
    setUploads((list) => [...items.map(({ file: _file, ...rest }) => rest), ...list.filter((u) => u.state !== "done")]);

    const valid = items.filter((item) => item.state !== "error");
    if (valid.length === 0) {
      toast.error(items[0]?.error ?? "That file can't be uploaded.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      for (const item of valid) patch(item.key, { state: "error", error: "Your session expired. Sign in again." });
      setBusy(false);
      toast.error("Your session expired. Sign in again to upload.");
      return;
    }

    let succeeded = 0;
    for (const item of valid) {
      const contentType = contentTypeFor(item.file);
      const path = `${projectId}/${targetCategory}/${newId()}-${safeFileName(item.file.name)}`;
      try {
        await uploadWithProgress(path, item.file, contentType, token, (progress) => patch(item.key, { progress }));
      } catch (err) {
        patch(item.key, { state: "error", error: uploadErrorMessage(err) });
        continue;
      }
      patch(item.key, { state: "saving", progress: 100 });
      const result = await registerProjectDocumentAction({
        project_id: projectId,
        category: targetCategory,
        storage_path: path,
        file_name: item.file.name.slice(0, 255),
        mime_type: contentType,
        size_bytes: item.file.size,
      }).catch(() => ({ ok: false as const, error: "We couldn't reach the server. Please try again." }));
      if (!result.ok) {
        patch(item.key, { state: "error", error: result.error });
        continue;
      }
      succeeded += 1;
      patch(item.key, { state: "done" });
    }
    setBusy(false);

    const failed = items.length - succeeded;
    if (succeeded > 0) {
      toast.success(succeeded === 1 ? "Document uploaded." : `${succeeded} documents uploaded.`);
      startTransition(() => router.refresh());
    }
    if (failed > 0) toast.error(failed === 1 ? "1 file couldn't be uploaded." : `${failed} files couldn't be uploaded.`);
  }

  function onPick(event: ChangeEvent<HTMLInputElement>, targetCategory: DocumentCategory) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void uploadFiles(files, targetCategory);
  }

  async function download(doc: ProjectDocumentItem) {
    setDownloading(doc.id);
    const result = await getDocumentDownloadUrlAction(doc.id).catch(() => ({
      ok: false as const,
      error: "We couldn't reach the server. Please try again.",
    }));
    setDownloading(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    window.location.assign(result.data.url);
  }

  const grouped = DOCUMENT_CATEGORIES.map((cat) => ({
    category: cat,
    items: documents.filter((doc) => doc.category === cat),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {canUpload ? (
        <section aria-labelledby="doc-upload-title" className="card-surface flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h2 id="doc-upload-title" className="text-base font-semibold text-text">
              Upload documents
            </h2>
            <p className="mt-1 text-sm text-muted">
              Site photos, drawings, bills and reports. Images, PDF, Word, Excel or CAD files up to 25 MB each.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FormField label="Category" id={categoryId} className="sm:w-64">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                disabled={busy}
                options={DOCUMENT_CATEGORIES.map((value) => ({ value, label: DOCUMENT_CATEGORY_LABELS[value] }))}
              />
            </FormField>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => fileInputRef.current?.click()} loading={busy} className="h-11">
                <Upload aria-hidden="true" />
                Choose files
              </Button>
              <Button variant="secondary" onClick={() => cameraInputRef.current?.click()} disabled={busy} className="h-11 sm:hidden">
                <Camera aria-hidden="true" />
                Take site photo
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={PROJECT_DOCUMENT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => onPick(e, category)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => onPick(e, "photos")}
            />
          </div>

          {uploads.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="Uploads" aria-live="polite">
              {uploads.map((item) => (
                <li key={item.key} className="flex flex-col gap-1.5 rounded-xl border border-border-soft p-3">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    {item.state === "done" ? (
                      <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-primary-strong" />
                    ) : item.state === "error" ? (
                      <CircleX aria-hidden="true" className="size-4 shrink-0 text-danger-text" />
                    ) : (
                      <Upload aria-hidden="true" className="size-4 shrink-0 text-muted" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium text-text">{item.name}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{formatFileSize(item.size)}</span>
                  </div>
                  {item.state === "error" ? (
                    <p className="text-xs text-danger-text">{item.error}</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div
                        role="progressbar"
                        aria-label={`Uploading ${item.name}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={item.progress}
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
                      >
                        <div
                          className={cn("h-full rounded-full transition-[width] duration-200", item.state === "done" ? "bg-primary" : "bg-deep")}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs text-muted">
                        {item.state === "done" ? "Uploaded" : item.state === "saving" ? "Saving…" : `${item.progress}%`}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : uploadNote ? (
        <p role="status" className="rounded-2xl border border-border-soft bg-surface-muted px-4 py-3 text-sm text-muted">
          {uploadNote}
        </p>
      ) : null}

      {grouped.length === 0 ? (
        <div className="card-surface">
          <EmptyState
            icon={FolderOpen}
            title="No documents yet"
            description={
              canUpload
                ? "Upload site photos, drawings, bills or reports to keep everything about this project in one place."
                : "Photos, drawings and reports uploaded by the team will appear here."
            }
          />
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.category} aria-labelledby={`docs-${group.category}`} className="card-surface flex flex-col gap-4 p-5 sm:p-6">
            <h2 id={`docs-${group.category}`} className="flex items-center gap-2 text-base font-semibold text-text">
              {DOCUMENT_CATEGORY_LABELS[group.category]}
              <span className="rounded-full bg-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-deep">{group.items.length}</span>
            </h2>
            <ul
              className={cn(
                "grid grid-cols-1 gap-3",
                group.category === "photos" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "md:grid-cols-2",
              )}
            >
              {group.items.map((doc) => (
                <li key={doc.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border-soft">
                  {group.category === "photos" || doc.thumbnailUrl ? (
                    <div className="flex aspect-[4/3] items-center justify-center bg-surface-muted">
                      {doc.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
                        <img src={doc.thumbnailUrl} alt={doc.fileName} loading="lazy" decoding="async" className="size-full object-cover" />
                      ) : (
                        <FileIcon mimeType={doc.mimeType} className="size-10 text-subtle" />
                      )}
                    </div>
                  ) : null}
                  <div className="flex min-w-0 flex-1 items-start gap-3 p-3">
                    {group.category === "photos" || doc.thumbnailUrl ? null : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-soft text-deep">
                        <FileIcon mimeType={doc.mimeType} className="size-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text" title={doc.fileName}>
                        {doc.fileName}
                      </p>
                      <p className="text-xs text-muted">
                        {formatFileSize(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                        {doc.uploaderName ? ` · ${doc.uploaderName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 border-t border-border-soft px-2 py-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 sm:h-9"
                      loading={downloading === doc.id}
                      onClick={() => void download(doc)}
                      aria-label={`Download ${doc.fileName}`}
                    >
                      <Download aria-hidden="true" />
                      Download
                    </Button>
                    {canArchive ? (
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="sm" className="h-11 text-danger-text hover:bg-danger-bg sm:h-9" aria-label={`Archive ${doc.fileName}`}>
                            <Archive aria-hidden="true" />
                            Archive
                          </Button>
                        }
                        title={`Archive ${doc.fileName}?`}
                        description="The document is hidden from the project. The file is kept in storage and the action is recorded in the activity log."
                        confirmLabel="Archive document"
                        destructive
                        onConfirm={async () => {
                          const result = await archiveProjectDocumentAction(doc.id);
                          if (!result.ok) return { ok: false, error: result.error };
                          toast.success(result.message ?? "Document archived.");
                          router.refresh();
                          return { ok: true };
                        }}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
