import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SectionCardProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Header action, e.g. a soft "This Month ⌄" select or a "View all" link. */
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Heading level for document outline (default h2). */
  as?: "h2" | "h3";
  id?: string;
  className?: string;
  contentClassName?: string;
};

/** Card with a header row (title + action), like TeamHub "Recent Activities ···". */
export function SectionCard({
  title,
  description,
  action,
  children,
  footer,
  as: Heading = "h2",
  id,
  className,
  contentClassName,
}: SectionCardProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("card-surface flex min-w-0 flex-col", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div className="min-w-0">
          <Heading id={headingId} className="text-lg font-semibold leading-tight tracking-tight text-text">
            {title}
          </Heading>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      <div className={cn("min-w-0 flex-1 px-5 pb-5 pt-4 sm:px-6", contentClassName)}>{children}</div>
      {footer ? <div className="border-t border-border-soft px-5 py-4 sm:px-6">{footer}</div> : null}
    </section>
  );
}
