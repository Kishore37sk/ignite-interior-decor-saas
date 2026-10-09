import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export type SeparatorProps = ComponentPropsWithRef<"div"> & {
  orientation?: "horizontal" | "vertical";
  /** Purely visual (default) or a semantic separator announced to assistive tech. */
  decorative?: boolean;
};

export function Separator({ className, orientation = "horizontal", decorative = true, ...props }: SeparatorProps) {
  return (
    <div
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "shrink-0 bg-border-soft",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px self-stretch",
        className,
      )}
      {...props}
    />
  );
}
