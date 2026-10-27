"use client";

import { useId, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { WORK_SCOPES, WORK_SCOPE_LABELS, type WorkScope } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type WorkScopePickerProps = {
  defaultValue: readonly string[];
  error?: string;
  /** Hidden (and nothing submitted) unless the project type takes a scope; the selection is kept. */
  visible: boolean;
  className?: string;
};

/** Scope of work checkboxes with "All areas"; submits one `work_scope` field per selected area. */
export function WorkScopePicker({ defaultValue, error, visible, className }: WorkScopePickerProps) {
  const id = useId();
  const [selected, setSelected] = useState<Set<WorkScope>>(
    () => new Set(WORK_SCOPES.filter((key) => defaultValue.includes(key))),
  );
  const all = selected.size === WORK_SCOPES.length;
  if (!visible) return null;

  function toggle(key: WorkScope, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  return (
    <fieldset className={cn("flex flex-col gap-3", className)} aria-describedby={error ? `${id}-error` : `${id}-hint`}>
      <legend className="text-sm font-medium text-text">Scope of work</legend>
      <p id={`${id}-hint`} className="-mt-1 text-xs text-muted">
        Which areas are included in this project? Choose one or more, or all.
      </p>
      <label
        className={cn(
          "flex w-fit cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm font-semibold",
          all ? "border-primary bg-soft text-deep" : "border-border-soft text-text",
        )}
      >
        <Checkbox
          checked={all ? true : selected.size > 0 ? "indeterminate" : false}
          onCheckedChange={(state) => setSelected(state === true ? new Set(WORK_SCOPES) : new Set())}
          aria-label="All areas"
        />
        All areas
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {WORK_SCOPES.map((key) => {
          const checked = selected.has(key);
          return (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                checked ? "border-primary/50 bg-soft/60 text-text" : "border-border-soft text-text hover:border-primary/40",
              )}
            >
              <Checkbox checked={checked} onCheckedChange={(state) => toggle(key, state === true)} />
              {WORK_SCOPE_LABELS[key]}
            </label>
          );
        })}
      </div>
      {WORK_SCOPES.filter((key) => selected.has(key)).map((key) => (
        <input key={key} type="hidden" name="work_scope" value={key} />
      ))}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger-text">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
