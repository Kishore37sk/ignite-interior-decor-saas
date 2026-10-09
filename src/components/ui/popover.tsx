"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  className,
  align = "center",
  sideOffset = 8,
  ...props
}: ComponentPropsWithRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={16}
        className={cn(
          "z-50 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border-soft bg-surface p-4 text-text shadow-pop outline-none",
          "data-[state=open]:animate-pop-in",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
