"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogOverlay({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-overlay/40 backdrop-blur-[2px]",
        "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        className,
      )}
      {...props}
    />
  );
}

const DIALOG_SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
} as const;

export type DialogContentProps = ComponentPropsWithRef<typeof DialogPrimitive.Content> & {
  size?: keyof typeof DIALOG_SIZES;
  /** Hide the top-right close button (e.g. while a blocking action runs). */
  hideClose?: boolean;
};

/**
 * Centered modal on ≥sm screens; full-width bottom sheet with a grab handle on phones.
 * Always render a `DialogTitle` (use `className="sr-only"` to hide it visually).
 */
export function DialogContent({ className, children, size = "md", hideClose = false, ...props }: DialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-pop outline-none",
          // Mobile: bottom sheet
          "inset-x-0 bottom-0 rounded-t-3xl pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-sheet-up",
          // Desktop: centered card
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:-translate-x-1/2 sm:-translate-y-1/2",
          "sm:rounded-2xl sm:pb-0 sm:data-[state=open]:animate-pop-in",
          DIALOG_SIZES[size],
          className,
        )}
        {...props}
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-grey sm:hidden" />
        {children}
        {hideClose ? null : (
          <DialogPrimitive.Close
            className={cn(
              "absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-lg text-muted",
              "transition-colors hover:bg-surface-muted hover:text-text",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            )}
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("flex flex-col gap-1.5 px-5 pb-2 pr-14 pt-4 sm:px-6 sm:pt-6", className)} {...props} />;
}

/** Scrollable body between header and footer. */
export function DialogBody({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t border-border-soft px-5 py-4 sm:flex-row sm:justify-end sm:px-6",
        "[&>*]:w-full sm:[&>*]:w-auto",
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-semibold leading-tight tracking-tight text-text", className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted", className)} {...props} />;
}

export type ModalProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Optional trigger element (rendered with `asChild`). */
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: DialogContentProps["size"];
  children?: ReactNode;
  className?: string;
};

/** Convenience wrapper: title, optional description, scrollable body and footer. */
export function Modal({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  footer,
  size,
  children,
  className,
}: ModalProps) {
  return (
    <Dialog open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        size={size}
        className={className}
        // Radix links the description automatically; opt out explicitly when there is none.
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children ? <DialogBody>{children}</DialogBody> : null}
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
