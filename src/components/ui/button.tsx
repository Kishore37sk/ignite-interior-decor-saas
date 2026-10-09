import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap",
    "rounded-xl font-semibold transition-colors duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover active:bg-primary-hover",
        secondary: "bg-soft text-deep hover:bg-soft-hover active:bg-soft-strong",
        outline: "border border-border bg-surface text-text hover:border-primary/40 hover:bg-surface-muted",
        ghost: "text-text hover:bg-surface-muted active:bg-surface-sunken",
        danger: "bg-danger text-white shadow-sm hover:bg-danger-hover active:bg-danger-hover",
        deep: "bg-deep text-white shadow-sm hover:bg-deep-hover",
        link: "h-auto rounded-md px-0 text-primary-strong underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm [&_svg]:size-4",
        md: "h-11 px-4 text-sm [&_svg]:size-[18px]",
        lg: "h-12 px-6 text-base [&_svg]:size-5",
        icon: "size-10 p-0 [&_svg]:size-5",
        "icon-sm": "size-8 rounded-lg p-0 [&_svg]:size-4",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "md", fullWidth: false },
  },
);

export type ButtonProps = ComponentPropsWithRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the single child element (e.g. a `<Link>`) with button styling. */
    asChild?: boolean;
    /** Shows a spinner, sets `aria-busy` and blocks interaction. */
    loading?: boolean;
    /** Optional text announced/visible while loading (defaults to the children). */
    loadingText?: string;
  };

/**
 * Primary action control. Variants: primary, secondary (soft green), outline, ghost,
 * danger, deep, link. Sizes: sm, md, lg, icon, icon-sm.
 */
export function Button({
  className,
  variant,
  size,
  fullWidth,
  asChild = false,
  loading = false,
  loadingText,
  disabled,
  type,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);

  if (asChild) {
    return (
      <Slot
        className={classes}
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size="sm" label={null} /> : null}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
