import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared control styling for text-like inputs, selects and textareas. */
export const controlClasses = cn(
  "w-full min-w-0 rounded-xl border border-border bg-surface px-3.5 text-sm text-text",
  "placeholder:text-subtle transition-[border-color,box-shadow] duration-150",
  "hover:border-border-hover",
  "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/15",
);

/** Read-only styling for text inputs/textareas (selects always match `:read-only`). */
export const readOnlyClasses = "read-only:bg-surface-muted read-only:focus-visible:ring-0";

export type InputProps = ComponentPropsWithRef<"input"> & {
  /** Icon or text rendered inside the left edge (decorative). */
  leading?: ReactNode;
  /** Icon or text rendered inside the right edge (decorative). */
  trailing?: ReactNode;
  /** Classes for the wrapper when `leading`/`trailing` are used. */
  wrapperClassName?: string;
};

export function Input({ className, type = "text", leading, trailing, wrapperClassName, ...props }: InputProps) {
  const input = (
    <input
      type={type}
      className={cn(
        controlClasses,
        readOnlyClasses,
        "h-11",
        leading ? "pl-10" : null,
        trailing ? "pr-10" : null,
        type === "date" || type === "number" ? "tabular-nums" : null,
        className,
      )}
      {...props}
    />
  );

  if (!leading && !trailing) return input;

  return (
    <div className={cn("relative w-full min-w-0", wrapperClassName)}>
      {leading ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted [&_svg]:size-[18px]"
        >
          {leading}
        </span>
      ) : null}
      {input}
      {trailing ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-muted [&_svg]:size-[18px]"
        >
          {trailing}
        </span>
      ) : null}
    </div>
  );
}
