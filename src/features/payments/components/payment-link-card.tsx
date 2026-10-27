"use client";

import { Check, Copy, ExternalLink, Link2, Link2Off, MessageCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { createPaymentLinkAction, disablePaymentLinkAction } from "../actions";

export type PaymentLinkCardProps = {
  projectId: string;
  projectName: string;
  clientName: string;
  /** Current statement URL, or null when no link is active. */
  url: string | null;
};

/** Owner: create, copy, share (WhatsApp), regenerate or disable the client's statement link. */
export function PaymentLinkCard({ projectId, projectName, clientName, url }: PaymentLinkCardProps) {
  const router = useRouter();
  const [creating, startCreate] = useTransition();
  const [copied, setCopied] = useState(false);

  function create() {
    startCreate(async () => {
      const result = await createPaymentLinkAction(projectId).catch(() => ({
        ok: false as const,
        error: "We couldn't reach the server. Please try again.",
      }));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Link created.");
      router.refresh();
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Couldn't copy automatically. Select the link and copy it manually.");
    }
  }

  if (!url) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Create a private link that shows {clientName} the project value, what they have paid (cash, card, UPI and
          more) and the balance due. No login needed, and it always shows the latest payments.
        </p>
        <Button onClick={create} loading={creating} className="w-fit">
          <Link2 aria-hidden="true" />
          Create payment link
        </Button>
      </div>
    );
  }

  const message = `Hello ${clientName}, here is the payment statement for ${projectName}: ${url}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={url}
          aria-label="Client payment link"
          onFocus={(event) => event.currentTarget.select()}
          leading={<Link2 />}
          className="font-mono text-xs"
        />
        <Button variant="secondary" onClick={copy} className="sm:shrink-0">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" />
            Share on WhatsApp
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" />
            Preview
          </a>
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm">
              <RefreshCw aria-hidden="true" />
              New link
            </Button>
          }
          title="Create a new link?"
          description="The current link stops working immediately. Send the new link to anyone who should still see the statement."
          confirmLabel="Create new link"
          onConfirm={async () => {
            const result = await createPaymentLinkAction(projectId, true);
            if (!result.ok) return { ok: false, error: result.error };
            toast.success(result.message ?? "New link created.");
            router.refresh();
            return { ok: true };
          }}
        />
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm">
              <Link2Off aria-hidden="true" />
              Disable
            </Button>
          }
          title="Disable the payment link?"
          description="Anyone opening the link will see that it is no longer available. You can create a new link later."
          confirmLabel="Disable link"
          destructive
          onConfirm={async () => {
            const result = await disablePaymentLinkAction(projectId);
            if (!result.ok) return { ok: false, error: result.error };
            toast.success(result.message ?? "Link disabled.");
            router.refresh();
            return { ok: true };
          }}
        />
      </div>
      <p className="text-xs text-muted">
        Anyone with this link can see the amounts and payment references, but not your internal notes. Share it only
        with the client.
      </p>
    </div>
  );
}
