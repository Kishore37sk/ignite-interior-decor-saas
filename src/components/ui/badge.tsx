import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Rounded-full pills. `solid` (default) = TeamHub's filled status pills;
 * `soft` = tinted background with coloured text (for secondary indicators).
 */
export const badgeVariants = cva(
  "inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium leading-none [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        success: "",
        warning: "bg-warning-bg text-warning-text",
        danger: "",
        primary: "bg-soft text-deep",
        info: "bg-info-bg text-info-text",
        muted: "bg-surface-sunken text-muted",
        deep: "",
        soft: "bg-soft text-deep",
        lime: "bg-lime/25 text-deep",
        outline: "border border-border bg-surface text-text",
      },
      appearance: {
        solid: "",
        soft: "",
      },
      size: {
        sm: "h-5 px-2 text-[11px] [&_svg]:size-3",
        md: "h-6 px-2.5 text-xs [&_svg]:size-3.5",
        lg: "h-7 px-3 text-sm [&_svg]:size-4",
      },
    },
    compoundVariants: [
      { tone: "success", appearance: "solid", className: "bg-primary text-white" },
      { tone: "success", appearance: "soft", className: "bg-success-bg text-success-text" },
      { tone: "danger", appearance: "solid", className: "bg-danger text-white" },
      { tone: "danger", appearance: "soft", className: "bg-danger-bg text-danger-text" },
      { tone: "deep", appearance: "solid", className: "bg-deep text-white" },
      { tone: "deep", appearance: "soft", className: "bg-soft-strong text-deep" },
    ],
    defaultVariants: { tone: "muted", appearance: "solid", size: "md" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;
export type BadgeAppearance = NonNullable<VariantProps<typeof badgeVariants>["appearance"]>;

export type BadgeProps = ComponentPropsWithRef<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Leading dot in the current text colour. */
    dot?: boolean;
  };

export function Badge({ className, tone, appearance, size, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, appearance, size }), className)} {...props}>
      {dot ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
