"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const FALLBACK_NAME = "ignite-report.csv";

function fileNameFrom(disposition: string | null): string {
  const match = disposition ? /filename="([^"]+)"/.exec(disposition) : null;
  return match?.[1] ?? FALLBACK_NAME;
}

async function errorMessage(response: Response): Promise<string> {
  if (response.status === 401) return "Your session has expired. Please sign in again.";
  if (response.status === 403) return "You don't have access to this report.";
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  } catch {
    // Not JSON — fall through to the generic message.
  }
  return "We couldn't export this report. Please try again.";
}

/**
 * Downloads the current report (with the filters in `href`) as CSV. Uses fetch so a
 * failure shows a toast instead of navigating to a raw error response.
 */
export function ExportCsvButton({ href, disabled = false }: { href: string; disabled?: boolean }) {
  const [pending, setPending] = useState(false);

  async function download() {
    setPending(true);
    try {
      const response = await fetch(href, { cache: "no-store", headers: { Accept: "text/csv" } });
      if (!response.ok) {
        toast.error(await errorMessage(response));
        return;
      }
      const name = fileNameFrom(response.headers.get("Content-Disposition"));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(`Downloaded ${name}`);
    } catch {
      toast.error("Network error — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={download}
      loading={pending}
      loadingText="Exporting…"
      disabled={disabled}
      title={disabled ? "Nothing to export for these filters" : undefined}
    >
      {pending ? null : <Download aria-hidden="true" />}
      Export CSV
    </Button>
  );
}
