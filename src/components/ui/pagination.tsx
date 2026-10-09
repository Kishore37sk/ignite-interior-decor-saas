"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { PAGE_SIZE_OPTIONS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { buildHref, totalPages } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { Select } from "./select";

export type PaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  /** Hide the "Show N" selector (e.g. on compact cards). */
  hidePageSize?: boolean;
  pageParam?: string;
  pageSizeParam?: string;
  /** Noun for the count, e.g. "projects". */
  itemLabel?: string;
  className?: string;
};

type PageToken = number | "gap-start" | "gap-end";

/** Page numbers with ellipses: 1 … 4 5 6 … 11 (at most 7 tokens). */
export function pageTokens(current: number, last: number): PageToken[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "gap-end", last];
  if (current >= last - 3) return [1, "gap-start", last - 4, last - 3, last - 2, last - 1, last];
  return [1, "gap-start", current - 1, current, current + 1, "gap-end", last];
}

const pageButton = cn(
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-medium tabular-nums transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
);

/**
 * TeamHub pagination: "Show [20] of 102 results" on the left, page buttons on the
 * right. URL-driven (`page`, `pageSize`), preserving all other search params.
 */
export function Pagination({
  total,
  page,
  pageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  hidePageSize = false,
  pageParam = "page",
  pageSizeParam = "pageSize",
  itemLabel = "results",
  className,
}: PaginationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (total <= 0) return null;

  const params = new URLSearchParams(searchParams.toString());
  const last = totalPages(total, pageSize);
  const current = Math.min(Math.max(1, page), last);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const hrefFor = (target: number) => buildHref(pathname, params, { [pageParam]: target === 1 ? null : target });
  const sizes = pageSizeOptions.includes(pageSize) ? pageSizeOptions : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

  function onPageSizeChange(value: string) {
    startTransition(() => {
      router.push(buildHref(pathname, params, { [pageSizeParam]: value, [pageParam]: null }), { scroll: false });
    });
  }

  return (
    <nav
      aria-label="Pagination"
      aria-busy={pending || undefined}
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        {hidePageSize ? null : (
          <>
            <span aria-hidden="true">Show</span>
            <Select
              size="sm"
              wrapperClassName="w-[4.75rem]"
              className="border-transparent bg-surface-muted font-medium text-text"
              value={String(pageSize)}
              onChange={(event) => onPageSizeChange(event.target.value)}
              options={sizes.map((size) => ({ value: String(size), label: String(size) }))}
              aria-label="Rows per page"
            />
          </>
        )}
        <span>
          <span className="sr-only">{`Showing ${formatNumber(from, 0)}–${formatNumber(to, 0)} `}</span>
          of <span className="font-medium tabular-nums text-text">{formatNumber(total, 0)}</span> {itemLabel}
        </span>
      </div>

      {last > 1 ? (
        <ul className="flex items-center gap-1 self-end sm:self-auto">
          <li>
            {current > 1 ? (
              <Link
                href={hrefFor(current - 1)}
                scroll={false}
                className={cn(pageButton, "text-text hover:bg-surface-muted")}
                aria-label="Previous page"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </Link>
            ) : (
              <span aria-disabled="true" className={cn(pageButton, "bg-surface-muted text-grey")}>
                <ChevronLeft aria-hidden="true" className="size-4" />
                <span className="sr-only">Previous page</span>
              </span>
            )}
          </li>
          {pageTokens(current, last).map((token) =>
            typeof token === "number" ? (
              <li key={token} className={cn(token !== current && token !== 1 && token !== last && "hidden sm:block")}>
                <Link
                  href={hrefFor(token)}
                  scroll={false}
                  aria-current={token === current ? "page" : undefined}
                  aria-label={`Page ${token}`}
                  className={cn(
                    pageButton,
                    token === current
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-text hover:bg-surface-muted",
                  )}
                >
                  {token}
                </Link>
              </li>
            ) : (
              <li key={token} aria-hidden="true" className={cn(pageButton, "text-muted")}>
                …
              </li>
            ),
          )}
          <li>
            {current < last ? (
              <Link
                href={hrefFor(current + 1)}
                scroll={false}
                className={cn(pageButton, "text-text hover:bg-surface-muted")}
                aria-label="Next page"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            ) : (
              <span aria-disabled="true" className={cn(pageButton, "bg-surface-muted text-grey")}>
                <ChevronRight aria-hidden="true" className="size-4" />
                <span className="sr-only">Next page</span>
              </span>
            )}
          </li>
        </ul>
      ) : null}
    </nav>
  );
}
