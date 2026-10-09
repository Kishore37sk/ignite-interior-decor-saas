import { Tooltip } from "@/components/ui/tooltip";

/**
 * "—" placeholder for a rate that cannot be computed yet, with a keyboard-reachable
 * tooltip explaining why (the explanation is also given to screen readers).
 */
export function NoRate({ reason }: { reason: string }) {
  return (
    <Tooltip content={reason}>
      <span
        tabIndex={0}
        className="inline-flex cursor-help rounded-sm px-1 text-muted underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden="true">—</span>
        <span className="sr-only">{reason}</span>
      </span>
    </Tooltip>
  );
}
