"use client";

import { Check, Copy, KeyRound, MailCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SetupLinkPanelProps =
  | { kind: "email"; email: string }
  | { kind: "link"; email: string; link: string; emailError: string | null; welcome?: boolean }
  | { kind: "none"; email: string; message: string };

/**
 * Result of a password setup/reset request. A generated link is shown ONCE (it lives only
 * in this component's state) — it is never stored or logged.
 */
export function SetupLinkPanel(props: SetupLinkPanelProps) {
  const [copied, setCopied] = useState(false);

  if (props.kind === "email") {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-soft p-4 text-sm text-deep">
        <MailCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <p>
          A secure password link was emailed to <strong className="break-all font-semibold">{props.email}</strong>. It can be
          used once and expires after a short time. Ask them to check their spam folder if it doesn&apos;t arrive.
        </p>
      </div>
    );
  }

  if (props.kind === "none") {
    return (
      <p role="alert" className="rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning-text">
        {props.message}
      </p>
    );
  }

  const { link } = props;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied. Share it privately with the user.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Couldn't copy automatically — select the link and copy it manually.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {props.emailError ? (
        <p className="rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning-text">
          We couldn&apos;t send the email ({props.emailError.replace(/\.$/, "")}). Share this one-time link with{" "}
          <strong className="break-all font-semibold">{props.email}</strong> instead.
        </p>
      ) : (
        <p className="text-sm text-muted">
          One-time link for <strong className="break-all font-semibold text-text">{props.email}</strong>.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={link}
          aria-label="One-time password setup link"
          onFocus={(event) => event.currentTarget.select()}
          leading={<KeyRound />}
          className="font-mono text-xs"
        />
        <Button variant="secondary" onClick={copy} className="sm:shrink-0">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      <p className="text-xs text-muted">
        This link is shown only once, works a single time and expires (1 hour by default). It lets the person choose
        their own password — nobody else ever sees it. Share it over a private channel.
      </p>
    </div>
  );
}
