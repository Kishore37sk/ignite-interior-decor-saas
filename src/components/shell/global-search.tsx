"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ClipboardList,
  Contact,
  CornerDownLeft,
  FolderKanban,
  LoaderCircle,
  Package,
  Search,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { SEARCH_MIN_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { GlobalSearchResult } from "@/types/database";

const ENTITY_META: Record<string, { label: string; icon: LucideIcon }> = {
  client: { label: "Clients", icon: Contact },
  project: { label: "Projects", icon: FolderKanban },
  people: { label: "People", icon: UserRound },
  material_request: { label: "Material Requests", icon: ClipboardList },
  material: { label: "Materials", icon: Package },
};
const FALLBACK_META = { label: "Results", icon: Search };

/** global_search returns team members as site_manager / admin / user — one "People" group. */
const GROUP_OF: Record<string, string> = { site_manager: "people", admin: "people", user: "people", profile: "people" };
const groupKey = (entityType: string) => GROUP_OF[entityType] ?? entityType;

const DEBOUNCE_MS = 250;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: GlobalSearchResult[] }
  | { status: "error"; message: string };

function isSearchResponse(value: unknown): value is { results: GlobalSearchResult[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { results?: unknown }).results)
  );
}

/** Topbar search pill + Cmd/Ctrl+K command dialog backed by `/api/search`. */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounced fetch; stale requests are aborted.
  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN_LENGTH) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ status: "loading" });
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (response.status === 401) {
          setState({ status: "error", message: "Your session has expired. Please sign in again." });
          return;
        }
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !isSearchResponse(body)) {
          setState({ status: "error", message: "Search is unavailable right now. Please try again." });
          return;
        }
        setActiveIndex(0);
        setState({ status: "done", results: body.results });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "error", message: "Search is unavailable right now. Please try again." });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Grouped by entity (first-seen order); `results` is re-numbered in the rendered order so
  // arrow keys move through the list exactly as it appears on screen.
  const { results, groups } = useMemo(() => {
    const raw = state.status === "done" ? state.results : [];
    const map = new Map<string, GlobalSearchResult[]>();
    for (const result of raw) {
      const key = groupKey(result.entity_type);
      map.set(key, [...(map.get(key) ?? []), result]);
    }
    const ordered: GlobalSearchResult[] = [];
    const grouped = Array.from(map.entries()).map(([key, items]) => [
      key,
      items.map((result) => {
        ordered.push(result);
        return { result, index: ordered.length - 1 };
      }),
    ] as const);
    return { results: ordered, groups: grouped };
  }, [state]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setState({ status: "idle" });
  }, []);

  const go = useCallback(
    (result: GlobalSearchResult | undefined) => {
      if (!result || !result.href.startsWith("/") || result.href.startsWith("//")) return;
      close();
      router.push(result.href);
    },
    [close, router],
  );

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[activeIndex]);
    }
  }

  const trimmed = query.trim();
  const activeId = results.length > 0 ? `${listId}-option-${activeIndex}` : undefined;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => (value ? setOpen(true) : close())}>
      <DialogPrimitive.Trigger
        className="group hidden h-11 w-full max-w-[360px] items-center gap-3 rounded-xl border border-border-soft bg-white px-4 text-left text-sm text-muted transition-colors hover:border-grey focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex"
        aria-label="Search clients, projects, people and requests"
      >
        <Search className="size-[18px] text-muted" aria-hidden="true" />
        <span className="flex-1 truncate">Search anything</span>
        <kbd className="hidden rounded-md border border-border-soft bg-background px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted lg:inline">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Trigger
        className="inline-flex size-11 items-center justify-center rounded-xl border border-border-soft bg-white text-text transition-colors hover:bg-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
        aria-label="Search"
      >
        <Search className="size-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[10vh] z-50 flex max-h-[75dvh] w-[calc(100vw-24px)] max-w-[600px] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border-soft bg-white shadow-pop outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b border-border-soft px-5">
            {state.status === "loading" ? (
              <LoaderCircle className="size-5 animate-spin text-brand" aria-hidden="true" />
            ) : (
              <Search className="size-5 text-muted" aria-hidden="true" />
            )}
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search clients, projects, SM001, MR-1004, cement…"
              className="h-14 flex-1 bg-transparent text-[15px] text-text placeholder:text-subtle focus:outline-none"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls={listId}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              aria-label="Search"
              maxLength={100}
              enterKeyHint="search"
            />
            <kbd className="hidden rounded-md border border-border-soft px-1.5 py-0.5 text-[11px] text-muted sm:inline">
              Esc
            </kbd>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
            {trimmed.length < SEARCH_MIN_LENGTH ? (
              <p className="px-5 py-10 text-center text-sm text-muted">
                Type at least {SEARCH_MIN_LENGTH} characters to search by name, code or employee ID.
              </p>
            ) : state.status === "error" ? (
              <p className="px-5 py-10 text-center text-sm text-danger-text">{state.message}</p>
            ) : state.status === "done" && results.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">
                No matches for <span className="font-semibold text-text">“{trimmed}”</span>.
              </p>
            ) : null}

            <ul ref={listRef} id={listId} role="listbox" aria-label="Search results" className="py-2">
              {groups.map(([type, entries]) => {
                const meta = ENTITY_META[type] ?? FALLBACK_META;
                const Icon = meta.icon;
                return (
                  <li key={type} role="presentation">
                    <p className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                      {meta.label}
                    </p>
                    <ul role="presentation">
                      {entries.map(({ result, index }) => {
                        const active = index === activeIndex;
                        return (
                          <li
                            key={`${result.entity_type}-${result.entity_id}`}
                            id={`${listId}-option-${index}`}
                            role="option"
                            aria-selected={active}
                            data-index={index}
                            onMouseMove={() => setActiveIndex(index)}
                            onClick={() => go(result)}
                            className={cn(
                              "mx-2 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5",
                              active ? "bg-soft" : "hover:bg-soft/40",
                            )}
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-deep">
                              <Icon className="size-[18px]" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-text">
                                {result.title}
                              </span>
                              {result.subtitle ? (
                                <span className="block truncate text-xs text-muted">{result.subtitle}</span>
                              ) : null}
                            </span>
                            {active ? (
                              <CornerDownLeft className="size-4 text-muted" aria-hidden="true" />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
