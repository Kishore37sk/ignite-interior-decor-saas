"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { Spinner } from "@/components/ui/spinner";
import { SEARCH_MAX_LENGTH } from "@/lib/constants";
import { buildHref } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export type SearchInputProps = {
  /** URL search param to sync with (default `q`). */
  param?: string;
  placeholder?: string;
  /** Accessible label (visually hidden). */
  label?: string;
  debounceMs?: number;
  className?: string;
};

/**
 * Debounced search box synced to `?q=` (300 ms). Changing the query resets `page`;
 * every other param is preserved. Enter applies immediately, Escape clears.
 */
export function SearchInput({
  param = "q",
  placeholder = "Search…",
  label = "Search",
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlValue = searchParams.get(param) ?? "";
  const [value, setValue] = useState(urlValue);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputId = useId();

  // Follow external URL changes (back/forward, "Clear filters") unless the user is mid-typing.
  useEffect(() => {
    if (timer.current === null) setValue(urlValue);
  }, [urlValue]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  function commit(next: string) {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const trimmed = next.trim();
    const current = new URLSearchParams(window.location.search);
    if ((current.get(param) ?? "") === trimmed) return;
    startTransition(() => {
      router.replace(buildHref(pathname, current, { [param]: trimmed || null }), { scroll: false });
    });
  }

  function onChange(next: string) {
    setValue(next);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), debounceMs);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(value);
    } else if (event.key === "Escape" && value) {
      event.preventDefault();
      setValue("");
      commit("");
    }
  }

  return (
    <div role="search" className={cn("relative w-full min-w-0", className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted"
      />
      <input
        id={inputId}
        type="search"
        inputMode="search"
        autoComplete="off"
        spellCheck={false}
        maxLength={SEARCH_MAX_LENGTH}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className={cn(
          "h-11 w-full rounded-xl border border-transparent bg-surface-muted pl-10 pr-10 text-sm text-text placeholder:text-subtle",
          "transition-[border-color,box-shadow,background-color] duration-150 hover:border-border",
          "focus-visible:border-primary focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
        {pending ? (
          <Spinner size="sm" label="Searching" className="mr-1.5 text-muted" />
        ) : value ? (
          <button
            type="button"
            onClick={() => {
              setValue("");
              commit("");
            }}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">Clear search</span>
          </button>
        ) : null}
      </span>
    </div>
  );
}
