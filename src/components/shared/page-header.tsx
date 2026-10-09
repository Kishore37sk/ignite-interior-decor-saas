import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Breadcrumb = { label: string; href?: string };

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Trail ending with the current page (rendered without a link). */
  breadcrumbs?: readonly Breadcrumb[];
  /** Back link shown above the title (mobile-friendly alternative to breadcrumbs). */
  back?: { href: string; label: string };
  /** Badges/meta next to the title (e.g. status pill, project code). */
  meta?: ReactNode;
  /** Right-aligned actions (buttons). Stack under the title on phones. */
  actions?: ReactNode;
  className?: string;
};

/** Page title block: breadcrumbs (TeamHub "Dashboard / Payroll"), title, description, actions. */
export function PageHeader({ title, description, breadcrumbs, back, meta, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        {back ? (
          <Link
            href={back.href}
            className={cn(
              "mb-1 inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-muted transition-colors hover:text-text",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            )}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {back.label}
          </Link>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight text-text sm:text-[28px] sm:leading-tight">
            {title}
          </h1>
          {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}
        {description ? <p className="max-w-3xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

function Breadcrumbs({ items }: { items: readonly Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="truncate rounded-sm font-medium text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={isLast ? "page" : undefined} className="truncate text-text">
                  {item.label}
                </span>
              )}
              {isLast ? null : <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-subtle" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
