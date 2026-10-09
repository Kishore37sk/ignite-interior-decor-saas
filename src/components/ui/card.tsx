import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";

/** White, rounded-2xl surface with the soft TeamHub shadow. */
export function Card({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("card-surface min-w-0", className)} {...props} />;
}

/** Header row: title block on the left, optional actions on the right. */
export function CardHeader({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentPropsWithRef<"h2">) {
  return <h2 className={cn("text-lg font-semibold leading-tight tracking-tight text-text", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentPropsWithRef<"p">) {
  return <p className={cn("mt-1 text-sm text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("px-5 py-5 sm:px-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-3 border-t border-border-soft px-5 py-4 sm:px-6", className)}
      {...props}
    />
  );
}
