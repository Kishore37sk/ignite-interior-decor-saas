import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge aware of the custom design tokens declared in `globals.css` `@theme`. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["card", "pop"],
      radius: ["card", "control"],
    },
  },
});

/** Compose class names, resolving conflicting Tailwind utilities (shadcn convention). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
