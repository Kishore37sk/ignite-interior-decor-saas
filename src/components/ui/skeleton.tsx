import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

/** Pulsing placeholder block. Decorative: wrap groups in an element with `aria-busy`. */
export function Skeleton({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-surface-sunken", className)} {...props} />
  );
}
