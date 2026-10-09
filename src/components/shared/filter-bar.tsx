"use client";

import { FilterX } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select, type SelectOption } from "@/components/ui/select";
import type { DateRangePreset } from "@/lib/constants";
import { buildHref } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "./date-range-picker";
import { SearchInput } from "./search-input";

export type FilterSelect = {
  /** URL param, e.g. `status`. */
  param: string;
  /** Accessible label, e.g. "Status". */
  label: string;
  options: readonly SelectOption[];
  /** Text for the empty option (default `All <label>`). */
  allLabel?: string;
};

export type FilterBarProps = {
  /** Show the debounced search box (synced to `searchParam`). */
  search?: boolean;
  searchParam?: string;
  searchPlaceholder?: string;
  filters?: readonly FilterSelect[];
  /** Date-range preset filter (`range`, `from`, `to`). */
  dateRange?: boolean | { label?: string; presets?: readonly DateRangePreset[]; anyLabel?: string };
  /** Additional params this bar should clear (e.g. `view`). */
  extraParams?: readonly string[];
  /** Extra controls rendered at the end (e.g. an export button). */
  children?: ReactNode;
  className?: string;
};

/**
 * List filters synced to the URL: debounced search, select filters and a date-range
 * preset. Every change resets `page`; "Clear filters" removes only the params this bar owns.
 */
export function FilterBar({
  search = true,
  searchParam = "q",
  searchPlaceholder = "Search…",
  filters = [],
  dateRange = false,
  extraParams = [],
  children,
  className,
}: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const owned = [
    ...(search ? [searchParam] : []),
    ...filters.map((filter) => filter.param),
    ...(dateRange ? ["range", "from", "to"] : []),
    ...extraParams,
  ];
  const active = owned.some((param) => (searchParams.get(param) ?? "") !== "");
  const rangeOptions = typeof dateRange === "object" ? dateRange : {};

  function navigate(updates: Record<string, string | null>) {
    const current = new URLSearchParams(window.location.search);
    startTransition(() => {
      router.replace(buildHref(pathname, current, updates), { scroll: false });
    });
  }

  function clearAll() {
    navigate(Object.fromEntries(owned.map((param) => [param, null])));
  }

  return (
    <div
      aria-busy={pending || undefined}
      className={cn("flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center", className)}
    >
      {search ? (
        <SearchInput param={searchParam} placeholder={searchPlaceholder} className="lg:max-w-xs lg:flex-1" />
      ) : null}
      {filters.length > 0 ? (
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {filters.map((filter) => (
            <Select
              key={filter.param}
              aria-label={filter.label}
              value={searchParams.get(filter.param) ?? ""}
              onChange={(event) => navigate({ [filter.param]: event.target.value || null })}
              placeholder={filter.allLabel ?? `All ${filter.label.toLowerCase()}`}
              options={filter.options}
              wrapperClassName="sm:w-44"
              className={cn((searchParams.get(filter.param) ?? "") !== "" && "border-primary/50 bg-soft/40")}
            />
          ))}
        </div>
      ) : null}
      {dateRange ? (
        <DateRangePicker label={rangeOptions.label} presets={rangeOptions.presets} anyLabel={rangeOptions.anyLabel} />
      ) : null}
      {active ? (
        <Button variant="ghost" size="md" onClick={clearAll} className="text-muted hover:text-text sm:w-fit">
          <FilterX aria-hidden="true" />
          Clear filters
        </Button>
      ) : null}
      {children ? <div className="flex flex-wrap items-center gap-2 lg:ml-auto">{children}</div> : null}
    </div>
  );
}
