import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export { SortableTH, type SortableTHProps } from "./sortable-th";

export type TableProps = ComponentPropsWithRef<"table"> & {
  wrapperClassName?: string;
};

/**
 * Horizontally scrollable table container. Uses `border-separate` so the light-grey
 * header row can have TeamHub's rounded ends.
 */
export function Table({ className, wrapperClassName, ...props }: TableProps) {
  return (
    <div className={cn("relative w-full min-w-0 overflow-x-auto", wrapperClassName)}>
      <table className={cn("w-full border-separate border-spacing-0 text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentPropsWithRef<"thead">) {
  return (
    <thead
      className={cn(
        "[&_th]:bg-surface-muted [&_tr>th:first-child]:rounded-l-xl [&_tr>th:last-child]:rounded-r-xl",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: ComponentPropsWithRef<"tbody">) {
  return <tbody className={cn("[&>tr:last-child>td]:border-b-0", className)} {...props} />;
}

export function TFoot({ className, ...props }: ComponentPropsWithRef<"tfoot">) {
  return <tfoot className={cn("font-semibold [&_td]:border-t [&_td]:border-border-soft", className)} {...props} />;
}

export type TRProps = ComponentPropsWithRef<"tr"> & {
  /** Hover tint + pointer, for rows that navigate. */
  interactive?: boolean;
  selected?: boolean;
};

export function TR({ className, interactive = false, selected = false, ...props }: TRProps) {
  return (
    <tr
      aria-selected={selected || undefined}
      className={cn(
        "[&>td]:border-b [&>td]:border-border-soft [&>td]:transition-colors",
        interactive && "group/row relative cursor-pointer hover:[&>td]:bg-surface-hover",
        selected && "[&>td]:bg-soft/50",
        className,
      )}
      {...props}
    />
  );
}

export type THProps = ComponentPropsWithRef<"th"> & {
  align?: "left" | "center" | "right";
};

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

export function TH({ className, align = "left", scope = "col", ...props }: THProps) {
  return (
    <th
      scope={scope}
      className={cn("h-11 whitespace-nowrap px-4 text-xs font-medium text-muted", ALIGN[align], className)}
      {...props}
    />
  );
}

export type TDProps = ComponentPropsWithRef<"td"> & {
  align?: "left" | "center" | "right";
};

export function TD({ className, align = "left", ...props }: TDProps) {
  return <td className={cn("px-4 py-3.5 align-middle text-text", ALIGN[align], className)} {...props} />;
}

/** Visually hidden table caption (every data table should have an accessible name). */
export function TableCaption({ className, ...props }: ComponentPropsWithRef<"caption">) {
  return <caption className={cn("sr-only", className)} {...props} />;
}
