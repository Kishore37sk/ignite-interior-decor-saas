import { DEVELOPER } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** "Developed by Kishore Kumar" footer credit, shown on every page. */
export function DeveloperCredit({ className }: { className?: string }) {
  return (
    <p className={cn("text-sm text-muted", className)}>
      Developed by{" "}
      <a
        href={DEVELOPER.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-primary-strong underline-offset-4 hover:underline"
      >
        {DEVELOPER.name}
      </a>
    </p>
  );
}
