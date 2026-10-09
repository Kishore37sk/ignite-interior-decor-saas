"use client";

import { BellRing } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runDeadlineCheckAction } from "../actions";

/** Runs generate_deadline_notifications() on demand and reports how many reminders were created. */
export function DeadlineCheckButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function run() {
    startTransition(async () => {
      try {
        const res = await runDeadlineCheckAction();
        if (!res.ok) {
          toast.error(res.error);
          setResult(null);
          return;
        }
        setResult(res.message ?? null);
        toast.success(res.message ?? "Deadline check finished.");
      } catch {
        toast.error("We couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" onClick={run} loading={pending} loadingText="Checking deadlines…" className="w-full sm:w-fit">
        <BellRing aria-hidden="true" />
        Run deadline check now
      </Button>
      <p role="status" aria-live="polite" className="text-sm text-muted">
        {result}
      </p>
    </div>
  );
}
