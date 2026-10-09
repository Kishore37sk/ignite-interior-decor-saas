"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const SIDES = {
  right: "inset-y-0 right-0 h-dvh w-[min(100vw-2.5rem,26rem)] border-l data-[state=open]:animate-slide-in-right",
  left: "inset-y-0 left-0 h-dvh w-[min(100vw-2.5rem,20rem)] border-r data-[state=open]:animate-slide-in-left",
  bottom:
    "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl border-t pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-sheet-up",
} as const;

export type SheetContentProps = ComponentPropsWithRef<typeof DialogPrimitive.Content> & {
  side?: keyof typeof SIDES;
  hideClose?: boolean;
};

/** Side drawer (navigation, filters, details). Always render a `SheetTitle`. */
export function SheetContent({ className, children, side = "right", hideClose = false, ...props }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-overlay/40 backdrop-blur-[2px]",
          "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        )}
      />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden border-border-soft bg-surface shadow-pop outline-none",
          SIDES[side],
          className,
        )}
        {...props}
      >
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
    </DialogPrimitive.Portal>
  );
}

export function SheetHeader({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div className={cn("flex flex-col gap-1 border-b border-border-soft px-5 py-4 pr-14", className)} {...props} />
  );
}

export function SheetBody({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 border-t border-border-soft px-5 py-4 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

export function SheetTitle({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-lg font-semibold text-text", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted", className)} {...props} />;
}
