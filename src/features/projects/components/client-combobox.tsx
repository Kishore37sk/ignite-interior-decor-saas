"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { controlClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ClientOption = { id: string; name: string; client_code: string; city: string | null };

export type ClientComboboxProps = {
  id: string;
  name: string;
  options: readonly ClientOption[];
  defaultValue?: string | null;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
};

const MAX_VISIBLE = 50;

/** Accessible searchable select (WAI-ARIA combobox + listbox) for choosing an active client. */
export function ClientCombobox({ id, name, options, defaultValue, invalid, describedBy, required }: ClientComboboxProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string>(
    defaultValue && options.some((o) => o.id === defaultValue) ? defaultValue : "",
  );
  const selected = options.find((o) => o.id === selectedId) ?? null;
  const [query, setQuery] = useState(selected ? labelOf(selected) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const showAll = !q || (selected && q === labelOf(selected).toLowerCase());
    const list = showAll
      ? options
      : options.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            o.client_code.toLowerCase().includes(q) ||
            (o.city?.toLowerCase().includes(q) ?? false),
        );
    return list.slice(0, MAX_VISIBLE);
  }, [options, query, selected]);

  function choose(option: ClientOption) {
    setSelectedId(option.id);
    setQuery(labelOf(option));
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (open && matches[active]) {
        event.preventDefault();
        choose(matches[active]);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        if (selected) setQuery(labelOf(selected));
      }
    }
  }

  const activeOption = open ? matches[active] : undefined;

  return (
    <div className="relative w-full min-w-0">
      <input type="hidden" name={name} value={selectedId} />
      <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        autoComplete="off"
        placeholder={options.length === 0 ? "No active clients — add a client first" : "Search client by name, code or city"}
        disabled={options.length === 0}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
          if (selected && event.target.value !== labelOf(selected)) setSelectedId("");
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          // Let option clicks register first.
          window.setTimeout(() => {
            setOpen(false);
            setQuery((current) => (selected && current !== labelOf(selected) ? labelOf(selected) : current));
          }, 120);
        }}
        onKeyDown={onKeyDown}
        className={cn(controlClasses, "h-11 pl-10 pr-10")}
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      {open && options.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Clients"
          className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop"
        >
          {matches.length === 0 ? (
            <li role="presentation" className="px-3 py-3 text-sm text-muted">
              No clients match “{query}”.
            </li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.id}
                id={`${listId}-${option.id}`}
                role="option"
                aria-selected={option.id === selectedId}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm",
                  index === active ? "bg-soft text-deep" : "text-text",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{option.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {option.client_code}
                    {option.city ? ` · ${option.city}` : ""}
                  </span>
                </span>
                {option.id === selectedId ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary-strong" /> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function labelOf(option: ClientOption): string {
  return `${option.name} (${option.client_code})`;
}
