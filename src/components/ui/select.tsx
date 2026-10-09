import { ChevronDown } from "lucide-react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { controlClasses } from "./input";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = Omit<ComponentPropsWithRef<"select">, "size"> & {
  /** Options to render. Children may be used instead for optgroups. */
  options?: readonly SelectOption[];
  /** Adds a first, empty-value option (e.g. "All statuses"). */
  placeholder?: string;
  size?: "sm" | "md";
  wrapperClassName?: string;
};

/** Native `<select>` (best on mobile, fully accessible) styled with a chevron. */
export function Select({
  className,
  wrapperClassName,
  options,
  placeholder,
  size = "md",
  children,
  ...props
}: SelectProps) {
  return (
    <div className={cn("relative w-full min-w-0", wrapperClassName)}>
      <select
        className={cn(
          controlClasses,
          "cursor-pointer appearance-none truncate pr-10",
          size === "sm" ? "h-9 rounded-lg text-sm" : "h-11",
          className,
        )}
        {...props}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options?.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}
