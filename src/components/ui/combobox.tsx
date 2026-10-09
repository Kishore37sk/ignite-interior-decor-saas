"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { controlClasses } from "./input";

export type ComboboxOption = {
  value: string;
  /** Shown in the list; defaults to `value`. */
  label?: string;
  /** Secondary line, e.g. "Lighting · Units". */
  description?: string;
};

export type ComboboxProps = Omit<ComponentPropsWithRef<"input">, "value" | "defaultValue" | "onChange" | "list" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ComboboxOption[];
  /** Accessible name of the option list, e.g. "Materials". */
  listLabel: string;
  /** Allow values that are not in the list (default true). When false, blur snaps back to a listed value. */
  allowCustom?: boolean;
  /** Shown when typing matches nothing. */
  emptyMessage?: string;
  maxVisible?: number;
};

const norm = (s: string) => s.trim().toLowerCase();
/** List max height (18rem) plus room for a sticky bottom bar. */
const DROP_UP_THRESHOLD = 380;

/**
 * Themed, accessible combobox (WAI-ARIA combobox + listbox). Replaces native
 * <datalist>, whose popup can't be styled and only lists entries matching the
 * current text. Opening an already-filled field shows the full list.
 */
export function Combobox({
  value,
  onValueChange,
  options,
  listLabel,
  allowCustom = true,
  emptyMessage = "No matches.",
  maxVisible = 100,
  className,
  disabled,
  onBlur,
  onFocus,
  onKeyDown,
  ...inputProps
}: ComboboxProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Show the full list until the user types (so a filled field still offers every option).
  const [filtering, setFiltering] = useState(false);
  // Open upward when there isn't room below (e.g. above a sticky action bar).
  const [dropUp, setDropUp] = useState(false);

  const matches = useMemo(() => {
    const q = norm(value);
    if (!filtering || !q) return options.slice(0, maxVisible);
    const hits = options.filter((o) =>
      [o.value, o.label ?? "", o.description ?? ""].some((text) => norm(text).includes(q)),
    );
    // Prefix matches first, then the rest in their original order.
    hits.sort((a, b) => Number(!norm(a.label ?? a.value).startsWith(q)) - Number(!norm(b.label ?? b.value).startsWith(q)));
    return hits.slice(0, maxVisible);
  }, [options, value, filtering, maxVisible]);

  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0));
  const activeOption = open ? matches[activeIndex] : undefined;

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function openList(showAll: boolean) {
    if (disabled) return;
    if (showAll) setFiltering(false);
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < DROP_UP_THRESHOLD && rect.top > spaceBelow);
    }
    const selectedIndex = options.findIndex((o) => norm(o.value) === norm(value));
    setActive(showAll && selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function choose(option: ComboboxOption) {
    onValueChange(option.value);
    setFiltering(false);
    setOpen(false);
  }

  function settle() {
    setOpen(false);
    setFiltering(false);
    if (allowCustom || value === "") return;
    const exact = options.find((o) => norm(o.value) === norm(value) || norm(o.label ?? "") === norm(value));
    if (exact) {
      if (exact.value !== value) onValueChange(exact.value);
    } else {
      onValueChange("");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openList(true);
      else setActive(Math.min(activeIndex + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (open) setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      if (open && activeOption) {
        event.preventDefault();
        choose(activeOption);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    } else if (event.key === "Tab") {
      if (open) settle();
    }
  }

  return (
    <div className="relative w-full min-w-0">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        disabled={disabled}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setFiltering(true);
          setActive(0);
          setOpen(true);
        }}
        onFocus={(event) => {
          onFocus?.(event);
          openList(true);
        }}
        onClick={() => {
          if (!open) openList(true);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          // Let option clicks register first.
          window.setTimeout(settle, 120);
        }}
        onKeyDown={handleKeyDown}
        className={cn(controlClasses, "h-11 pr-11", className)}
        {...inputProps}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? `Hide ${listLabel.toLowerCase()}` : `Show all ${listLabel.toLowerCase()}`}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (open) setOpen(false);
          else {
            inputRef.current?.focus();
            openList(true);
          }
        }}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted hover:text-text disabled:cursor-not-allowed"
      >
        <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && options.length > 0 ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className={cn(
            "absolute inset-x-0 z-40 max-h-72 min-w-[14rem] overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop",
            dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {matches.length === 0 ? (
            <li role="presentation" className="px-3 py-3 text-sm text-muted">
              {emptyMessage}
            </li>
          ) : (
            matches.map((option, index) => {
              const selected = norm(option.value) === norm(value);
              return (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm sm:min-h-0",
                    index === activeIndex ? "bg-soft text-deep" : "text-text",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{option.label ?? option.value}</span>
                    {option.description ? <span className="block truncate text-xs text-muted">{option.description}</span> : null}
                  </span>
                  {selected ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary-strong" /> : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
