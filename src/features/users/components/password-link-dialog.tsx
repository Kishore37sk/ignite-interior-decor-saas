"use client";

import { KeyRound, Link2, Mail } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sendPasswordLinkAction, type PasswordLinkResult } from "../actions";
import { SetupLinkPanel } from "./setup-link-panel";
import type { ManagedUser } from "./types";

/** Send a password setup/reset email, or generate a one-time link to share manually. */
export function PasswordLinkDialog({
  user,
  open,
  onOpenChange,
}: {
  user: ManagedUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"email" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PasswordLinkResult | null>(null);

  function change(next: boolean) {
    if (pending) return;
    if (!next) {
      setResult(null);
      setError(null);
      setMode(null);
    }
    onOpenChange(next);
  }

  function run(nextMode: "email" | "link") {
    setMode(nextMode);
    setError(null);
    startTransition(async () => {
      try {
        const res = await sendPasswordLinkAction(user.id, nextMode);
        if (!res.ok) {
          setError(res.error);
          toast.error(res.error);
          return;
        }
        setResult(res.data);
        toast.success(res.message ?? "Done.");
      } catch {
        const message = "We couldn't reach the server. Check your connection and try again.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        size="md"
        hideClose={pending}
        onInteractOutside={(e) => (pending || result) && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Password link for {user.full_name}</DialogTitle>
          <DialogDescription>
            Passwords are never shown or set by the owner. {user.full_name.split(" ")[0]} chooses a new password using a
            secure one-time link.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {result ? (
            result.delivery === "email" ? (
              <SetupLinkPanel kind="email" email={result.email} />
            ) : (
              <SetupLinkPanel kind="link" email={result.email} link={result.link} emailError={result.emailError} />
            )
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-xl bg-surface-muted p-4 text-sm text-muted">
                <KeyRound aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-strong" />
                <p>
                  The link goes to <strong className="break-all font-semibold text-text">{user.email}</strong>. Any earlier
                  unused link stops working.
                </p>
              </div>
              {error ? (
                <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {result ? (
            <Button onClick={() => change(false)}>Done</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => run("link")}
                loading={pending && mode === "link"}
                disabled={pending}
              >
                <Link2 aria-hidden="true" />
                Generate link to share
              </Button>
              <Button onClick={() => run("email")} loading={pending && mode === "email"} disabled={pending}>
                <Mail aria-hidden="true" />
                Email the link
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
