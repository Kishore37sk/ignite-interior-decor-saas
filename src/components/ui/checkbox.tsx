"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export type CheckboxProps = ComponentPropsWithRef<typeof CheckboxPrimitive.Root> & {
  size?: "sm" | "md";
};

/**
 * TeamHub checkbox: soft grey rounded square, filled primary with a white tick when
 * checked (or a dash when `checked="indeterminate"`).
 */
export function Checkbox({ className, size = "md", ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer inline-flex shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface",
        "transition-colors duration-150 hover:border-primary",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-white",
        "aria-[invalid=true]:border-danger",
        size === "sm" ? "size-4" : "size-5",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="group flex items-center justify-center">
        <Check
          aria-hidden="true"
          strokeWidth={3}
          className={cn("group-data-[state=indeterminate]:hidden", size === "sm" ? "size-3" : "size-3.5")}
        />
        <Minus
          aria-hidden="true"
          strokeWidth={3}
          className={cn("hidden group-data-[state=indeterminate]:block", size === "sm" ? "size-3" : "size-3.5")}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
