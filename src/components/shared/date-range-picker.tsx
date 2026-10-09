"use client";

import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DATE_RANGE_PRESETS, DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/lib/constants";
import { isDateOnly } from "@/lib/dates";
import { buildHref } from "@/lib/search-params";
import { cn } from "@/lib/utils";

export type DateRangePickerProps = {
  /** What the range filters, e.g. "Due date" (used for labels). */
  label?: string;
  /** Presets to offer (default: all). */
  presets?: readonly DateRangePreset[];
  /** Text for the "no range" option. */
  anyLabel?: string;
  params?: { range: string; from: string; to: string };
  className?: string;
};

const DEFAULT_PARAMS = { range: "range", from: "from", to: "to" } as const;

function isPreset(value: string | null): value is DateRangePreset {
  return value !== null && (DATE_RANGE_PRESETS as readonly string[]).includes(value);
}

/**
 * URL-synced date range: preset select (`range`) plus from/to inputs for `custom`.
 * Bare `from`/`to` without a preset are treated as custom (mirrors `parseDateRange`).
 */
export function DateRangePicker({
  label = "Date range",
  presets = DATE_RANGE_PRESETS,
  anyLabel = "Any date",
  params: names = DEFAULT_PARAMS,
  className,
}: DateRangePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const id = useId();

  const rawRange = searchParams.get(names.range);
  const fromValue = searchParams.get(names.from) ?? "";
  const toValue = searchParams.get(names.to) ?? "";
  const preset: DateRangePreset | "" = isPreset(rawRange) ? rawRange : fromValue || toValue ? "custom" : "";

  function navigate(updates: Record<string, string | null>) {
    const current = new URLSearchParams(window.location.search);
    startTransition(() => {
      router.replace(buildHref(pathname, current, updates), { scroll: false });
    });
  }

  function onPresetChange(next: string) {
    if (next === "custom") {
      navigate({ [names.range]: "custom" });
    } else {
      navigate({ [names.range]: next || null, [names.from]: null, [names.to]: null });
    }
  }

  function onDateChange(which: "from" | "to", next: string) {
    if (next !== "" && !isDateOnly(next)) return;
    navigate({ [names.range]: "custom", [names[which]]: next || null });
  }

  return (
    <div
      aria-busy={pending || undefined}
      className={cn("flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center", className)}
    >
      <Select
        aria-label={label}
        value={preset}
        onChange={(event) => onPresetChange(event.target.value)}
        wrapperClassName="sm:w-44"
        options={[
          { value: "", label: anyLabel },
          ...presets.map((value) => ({ value, label: DATE_RANGE_PRESET_LABELS[value] })),
        ]}
      />
      {preset === "custom" ? (
        <fieldset className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:items-center">
          <legend className="sr-only">{`${label}: custom range`}</legend>
          <label htmlFor={`${id}-from`} className="sr-only">
            From
          </label>
          <Input
            id={`${id}-from`}
            type="date"
            value={fromValue}
            max={toValue || undefined}
            onChange={(event) => onDateChange("from", event.target.value)}
            leading={<CalendarDays />}
            wrapperClassName="sm:w-44"
          />
          <label htmlFor={`${id}-to`} className="sr-only">
            To
          </label>
          <Input
            id={`${id}-to`}
            type="date"
            value={toValue}
            min={fromValue || undefined}
            onChange={(event) => onDateChange("to", event.target.value)}
            leading={<CalendarDays />}
            wrapperClassName="sm:w-44"
          />
        </fieldset>
      ) : null}
    </div>
  );
}
