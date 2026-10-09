import { Ban, Check, CircleDot, XCircle } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { MaterialRequestDirectoryRow } from "@/types/database";

type StepState = "done" | "current" | "upcoming" | "rejected" | "cancelled";
type Step = { label: string; at: string | null; state: StepState; note?: string | null };

const BASE_LABELS = ["Requested", "Review", "Approved", "Ordered", "Delivered"] as const;

function buildSteps(r: MaterialRequestDirectoryRow): Step[] {
  const stamps = [r.requested_at, r.reviewed_at, r.approved_at, r.ordered_at, r.completed_at];

  if (r.status === "rejected" || r.status === "cancelled") {
    // Show the steps actually reached, then the terminal state.
    let reached = 0;
    stamps.forEach((stamp, index) => {
      if (stamp) reached = index;
    });
    const steps: Step[] = BASE_LABELS.slice(0, reached + 1).map((label, index) => ({
      label,
      at: stamps[index] ?? null,
      state: "done",
    }));
    steps.push(
      r.status === "rejected"
        ? { label: "Rejected", at: r.rejected_at, state: "rejected", note: r.rejection_reason }
        : { label: "Cancelled", at: r.cancelled_at, state: "cancelled" },
    );
    return steps;
  }

  const currentIndex: Record<string, number> = {
    requested: 0,
    pending_review: 1,
    approved: 2,
    ordered: 3,
    partially_delivered: 4,
    delivered: 4,
  };
  const current = currentIndex[r.status] ?? 0;
  return BASE_LABELS.map((label, index) => {
    let state: StepState = index < current ? "done" : index === current ? "current" : "upcoming";
    if (r.status === "delivered" && index === 4) state = "done";
    const step: Step = { label, at: stamps[index] ?? null, state };
    if (index === 4 && r.status === "partially_delivered") {
      step.label = "Partially delivered";
      step.at = null;
      step.note = r.delivery_date ? `Last delivery ${formatDate(r.delivery_date)}` : null;
    }
    if (index === 4 && r.status === "delivered" && !step.at && r.delivery_date) step.note = formatDate(r.delivery_date);
    if (index === 3 && r.expected_delivery_date && (r.status === "ordered" || r.status === "partially_delivered")) {
      step.note = `Expected ${formatDate(r.expected_delivery_date)}`;
    }
    return step;
  });
}

const DOT: Record<StepState, string> = {
  done: "bg-primary text-white border-primary",
  current: "bg-soft text-deep border-primary",
  upcoming: "bg-surface text-muted border-border",
  rejected: "bg-danger text-white border-danger",
  cancelled: "bg-surface-sunken text-muted border-grey",
};

/** Requested → Review → Approved → Ordered → Delivered, with timestamps and terminal states. */
export function StatusStepper({ request }: { request: MaterialRequestDirectoryRow }) {
  const steps = buildSteps(request);
  return (
    <ol className="flex flex-col gap-0 md:flex-row md:gap-2" aria-label="Request progress">
      {steps.map((step, index) => {
        const Icon =
          step.state === "done" ? Check : step.state === "rejected" ? XCircle : step.state === "cancelled" ? Ban : CircleDot;
        const isLast = index === steps.length - 1;
        return (
          <li
            key={`${step.label}-${index}`}
            className="relative flex min-w-0 flex-1 gap-3 pb-5 md:flex-col md:items-start md:gap-2 md:pb-0"
            aria-current={step.state === "current" ? "step" : undefined}
          >
            {!isLast ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 md:left-10 md:top-[15px] md:h-0.5 md:w-[calc(100%-2.5rem)]",
                  step.state === "done" ? "bg-primary" : "bg-border",
                )}
              />
            ) : null}
            <span
              aria-hidden="true"
              className={cn("relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2", DOT[step.state])}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-1 md:pt-0">
              <p
                className={cn(
                  "text-sm font-semibold",
                  step.state === "upcoming" ? "text-muted" : step.state === "rejected" ? "text-danger-text" : "text-text",
                )}
              >
                {step.label}
                <span className="sr-only">
                  {step.state === "done" ? " (completed)" : step.state === "current" ? " (current step)" : step.state === "upcoming" ? " (not yet)" : ""}
                </span>
              </p>
              {step.at ? <p className="text-xs tabular-nums text-muted">{formatDateTime(step.at)}</p> : null}
              {step.note ? (
                <p className={cn("mt-0.5 break-words text-xs", step.state === "rejected" ? "text-danger-text" : "text-muted")}>{step.note}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
