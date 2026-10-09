import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export type LabelProps = ComponentPropsWithRef<"label"> & {
  /** Appends a red asterisk (hidden from screen readers; use `required` on the control). */
  required?: boolean;
};

export function Label({ className, required = false, children, ...props }: LabelProps) {
  return (
    <label className={cn("inline-flex items-center gap-1 text-sm font-medium text-text", className)} {...props}>
      {children}
      {required ? (
        <span aria-hidden="true" className="text-danger">
          *
        </span>
      ) : null}
    </label>
  );
}
