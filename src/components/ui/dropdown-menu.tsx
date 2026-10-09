"use client";

import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuGroup = DropdownPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownPrimitive.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "end",
  ...props
}: ComponentPropsWithRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 min-w-48 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border-soft bg-surface p-1.5 shadow-pop",
          "max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto",
          "data-[state=open]:animate-pop-in",
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

const itemClasses = cn(
  "relative flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-text outline-none",
  "transition-colors data-[highlighted]:bg-surface-muted",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted",
);

export type DropdownMenuItemProps = ComponentPropsWithRef<typeof DropdownPrimitive.Item> & {
  destructive?: boolean;
};

export function DropdownMenuItem({ className, destructive = false, ...props }: DropdownMenuItemProps) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        itemClasses,
        destructive && "text-danger-text data-[highlighted]:bg-danger-bg [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentPropsWithRef<typeof DropdownPrimitive.CheckboxItem>) {
  return (
    <DropdownPrimitive.CheckboxItem className={cn(itemClasses, "pl-8", className)} {...props}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <DropdownPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="text-primary!" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentPropsWithRef<typeof DropdownPrimitive.RadioItem>) {
  return (
    <DropdownPrimitive.RadioItem className={cn(itemClasses, "pl-8", className)} {...props}>
      <span className="absolute left-2.5 flex size-4 items-center justify-center">
        <DropdownPrimitive.ItemIndicator>
          <Check aria-hidden="true" className="text-primary!" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentPropsWithRef<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn("px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentPropsWithRef<typeof DropdownPrimitive.Separator>) {
  return <DropdownPrimitive.Separator className={cn("-mx-1.5 my-1.5 h-px bg-border-soft", className)} {...props} />;
}
