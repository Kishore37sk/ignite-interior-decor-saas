"use client";

import { CircleAlert, TriangleAlert } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

/** What `onConfirm` may return. `false` or `{ ok: false }` keeps the dialog open. */
export type ConfirmResult = void | boolean | { ok: boolean; error?: string };

export type ConfirmDialogProps = {
  /** Element that opens the dialog (rendered with `asChild`). Omit when controlled. */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Extra content (e.g. a reason textarea) between description and actions. */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon. */
  destructive?: boolean;
  /** Disable the confirm button (e.g. until a required reason is typed). */
  confirmDisabled?: boolean;
  /** Runs on confirm; the dialog shows a spinner and stays open until it settles. */
  onConfirm: () => ConfirmResult | Promise<ConfirmResult>;
};

const GENERIC_ERROR = "Something went wrong. Please try again.";

function failureMessage(result: ConfirmResult): string | null {
  if (result === false) return null;
  if (typeof result === "object" && result !== null && !result.ok) return result.error ?? GENERIC_ERROR;
  return null;
}

function isFailure(result: ConfirmResult): boolean {
  return result === false || (typeof result === "object" && result !== null && !result.ok);
}

/** Accessible confirmation step for consequential actions, with async loading state. */
export function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  confirmDisabled = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = openProp ?? uncontrolledOpen;

  function setOpen(next: boolean) {
    if (pending && !next) return; // never close mid-action
    if (!next) setError(null);
    if (openProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await onConfirm();
        if (isFailure(result)) {
          setError(failureMessage(result));
          return;
        }
        if (openProp === undefined) setUncontrolledOpen(false);
        onOpenChange?.(false);
      } catch {
        setError(GENERIC_ERROR);
      }
    });
  }

  const Icon = destructive ? TriangleAlert : CircleAlert;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        size="sm"
        hideClose={pending}
        role="alertdialog"
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pending) event.preventDefault();
        }}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader className="items-start">
          <span
            aria-hidden="true"
            className={cn(
              "mb-2 inline-flex size-11 items-center justify-center rounded-xl",
              destructive ? "bg-danger-bg text-danger" : "bg-soft text-deep",
            )}
          >
            <Icon className="size-5" />
          </span>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children || error ? (
          <DialogBody className="flex flex-col gap-3">
            {children}
            {error ? (
              <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text">
                {error}
              </p>
            ) : null}
          </DialogBody>
        ) : null}
        <DialogFooter className="border-t-0 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={handleConfirm}
            loading={pending}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
