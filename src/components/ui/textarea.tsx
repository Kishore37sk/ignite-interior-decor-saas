import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/utils";
import { controlClasses, readOnlyClasses } from "./input";

export type TextareaProps = ComponentPropsWithRef<"textarea">;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(controlClasses, readOnlyClasses, "min-h-24 resize-y py-3 leading-relaxed", className)}
      {...props}
    />
  );
}
