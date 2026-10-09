"use client";

import Link from "next/link";
import {
  createContext,
  use,
  useId,
  useState,
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Client tabs (WAI-ARIA tabs pattern, automatic activation)                  */
/* -------------------------------------------------------------------------- */

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const ctx = use(TabsContext);
  if (!ctx) throw new Error(`<${component}> must be rendered inside <Tabs>.`);
  return ctx;
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export type TabsProps = Omit<ComponentPropsWithRef<"div">, "onChange" | "defaultValue"> & {
  value?: string;
  defaultValue: string;
  onValueChange?: (value: string) => void;
};

export function Tabs({ value: valueProp, defaultValue, onValueChange, className, ...props }: TabsProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const value = valueProp ?? uncontrolled;
  const setValue = (next: string) => {
    if (valueProp === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };
  return (
    <TabsContext value={{ value, setValue, baseId }}>
      <div className={cn("flex min-w-0 flex-col gap-4", className)} {...props} />
    </TabsContext>
  );
}

const tabListClasses = cn(
  "flex w-full min-w-0 items-center gap-1 overflow-x-auto scrollbar-none border-b border-border-soft",
  "[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] sm:[mask-image:none]",
);

const tabTriggerClasses = cn(
  "relative inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-t-lg px-3 text-sm font-medium text-muted",
  "transition-colors hover:text-text",
  "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors",
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
);

const tabActiveClasses = "text-deep after:bg-primary";

export function TabsList({ className, onKeyDown, ...props }: ComponentPropsWithRef<"div">) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'),
    );
    const index = tabs.findIndex((tab) => tab === document.activeElement);
    if (index === -1) return;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next];
    target?.focus();
    target?.click();
  }
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={cn(tabListClasses, className)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export type TabsTriggerProps = Omit<ComponentPropsWithRef<"button">, "value"> & {
  value: string;
  /** Optional count chip (e.g. number of requests). */
  count?: number;
};

export function TabsTrigger({ value, count, className, children, onClick, ...props }: TabsTriggerProps) {
  const ctx = useTabs("TabsTrigger");
  const selected = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.baseId}-tab-${slug(value)}`}
      aria-controls={`${ctx.baseId}-panel-${slug(value)}`}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      data-state={selected ? "active" : "inactive"}
      className={cn(tabTriggerClasses, selected && tabActiveClasses, className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) ctx.setValue(value);
      }}
      {...props}
    >
      {children}
      {count !== undefined ? <TabCount count={count} active={selected} /> : null}
    </button>
  );
}

export type TabsContentProps = ComponentPropsWithRef<"div"> & {
  value: string;
  /** Keep the panel mounted (hidden) when inactive. */
  forceMount?: boolean;
};

export function TabsContent({ value, forceMount = false, className, ...props }: TabsContentProps) {
  const ctx = useTabs("TabsContent");
  const selected = ctx.value === value;
  if (!selected && !forceMount) return null;
  return (
    <div
      role="tabpanel"
      id={`${ctx.baseId}-panel-${slug(value)}`}
      aria-labelledby={`${ctx.baseId}-tab-${slug(value)}`}
      hidden={!selected}
      tabIndex={0}
      className={cn("min-w-0 focus-visible:outline-none", className)}
      {...props}
    />
  );
}

function TabCount({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        active ? "bg-primary text-white" : "bg-surface-sunken text-muted",
      )}
    >
      {count}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* URL tabs (navigation links, e.g. /projects/[id]?tab=timeline)              */
/* -------------------------------------------------------------------------- */

export type LinkTabItem = {
  value: string;
  label: ReactNode;
  href: string;
  count?: number;
};

export type LinkTabsProps = {
  items: readonly LinkTabItem[];
  /** Value of the active tab. */
  active: string;
  /** Accessible name for the navigation landmark. */
  label: string;
  className?: string;
};

/**
 * Tab-styled navigation whose tabs are real links (shareable, server-rendered).
 * The active link carries `aria-current="page"`. Scrolls horizontally on mobile.
 */
export function LinkTabs({ items, active, label, className }: LinkTabsProps) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul className={tabListClasses}>
        {items.map((item) => {
          const isActive = item.value === active;
          return (
            <li key={item.value} className="shrink-0">
              <Link
                href={item.href}
                scroll={false}
                aria-current={isActive ? "page" : undefined}
                className={cn(tabTriggerClasses, isActive && tabActiveClasses)}
              >
                {item.label}
                {item.count !== undefined ? <TabCount count={item.count} active={isActive} /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
