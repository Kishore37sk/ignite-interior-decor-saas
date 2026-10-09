"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { buildHref } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export type SortableTHProps = {
  /** Value written to `?sort=`. */
  sortKey: string;
  children: ReactNode;
  /** Active sort (pass the parsed default so it shows even when the URL has no `sort`). */
  currentSort?: string;
  currentDir?: SortDir;
  /** Direction used when this column is first activated. */
  firstDir?: SortDir;
  align?: "left" | "center" | "right";
  className?: string;
};

/**
 * Column header that toggles `sort`/`dir` in the URL (keeping every other param and
 * resetting `page`). Exposes `aria-sort` on the `<th>`.
 */
export function SortableTH({
  sortKey,
  children,
  currentSort,
  currentDir,
  firstDir = "asc",
  align = "left",
  className,
}: SortableTHProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());

  const activeSort = currentSort ?? params.get("sort") ?? undefined;
  const urlDir = params.get("dir");
  const activeDir: SortDir = currentDir ?? (urlDir === "desc" ? "desc" : urlDir === "asc" ? "asc" : firstDir);
  const isActive = activeSort === sortKey;
  const nextDir: SortDir = isActive ? (activeDir === "asc" ? "desc" : "asc") : firstDir;
  const href = buildHref(pathname, params, { sort: sortKey, dir: nextDir });

  const Icon = !isActive ? ChevronsUpDown : activeDir === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      aria-sort={isActive ? (activeDir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(
        "h-11 whitespace-nowrap px-4 text-xs font-medium text-muted",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      <Link
        href={href}
        scroll={false}
        replace
        className={cn(
          "-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:text-text",
          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
          isActive && "text-text",
        )}
      >
        {children}
        <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", isActive ? "text-primary-strong" : "opacity-70")} />
        <span className="sr-only">
          {`, sort ${nextDir === "asc" ? "ascending" : "descending"}`}
        </span>
      </Link>
    </th>
  );
}
