import { LoaderCircle } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "size-3.5",
  sm: "size-4",
  md: "size-5",
  lg: "size-8",
} as const;

export type SpinnerSize = keyof typeof SIZES;

export type SpinnerProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  size?: SpinnerSize;
  /** Accessible label. Pass `null` when the spinner is decorative (e.g. inside a busy button). */
  label?: string | null;
};

/** Indeterminate loading indicator. Announces `label` to screen readers unless decorative. */
export function Spinner({ size = "md", label = "Loading", className, ...props }: SpinnerProps) {
  const decorative = label === null;
  return (
    <span
      role={decorative ? undefined : "status"}
      aria-hidden={decorative ? true : undefined}
      className={cn("inline-flex items-center justify-center text-current", className)}
      {...props}
    >
      <LoaderCircle className={cn("animate-spin", SIZES[size])} aria-hidden="true" />
      {decorative ? null : <span className="sr-only">{label}</span>}
    </span>
  );
}
