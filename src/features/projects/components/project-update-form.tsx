"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, FieldErrors } from "@/lib/action-result";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/types/database";
import { submitProjectUpdateAction } from "../actions";

export type ProjectUpdateFormProps = {
  projectId: string;
  /** Site managers can't cancel a project. */
  allowCancel: boolean;
  milestones: readonly string[];
  defaults: {
    status: ProjectStatus;
    progress: number;
    milestone: string;
    expectedCompletion: string;
  };
  startDate: string | null;
};

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Mobile-first progress update form (rpc submit_project_update). */
export function ProjectUpdateForm({ projectId, allowCancel, milestones, defaults, startDate }: ProjectUpdateFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(clampProgress(defaults.progress));
  const [progressText, setProgressText] = useState<string>(String(clampProgress(defaults.progress)));
  const today = todayIST();

  const statusOptions = PROJECT_STATUSES.filter((s) => allowCancel || s !== "cancelled" || defaults.status === "cancelled").map(
    (value) => ({ value, label: PROJECT_STATUS_LABELS[value] }),
  );
  const milestoneOptions = Array.from(new Set([...milestones, ...(defaults.milestone ? [defaults.milestone] : [])]));

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("progress", String(progress));
    setFormError(null);
    startTransition(async () => {
      let result: ActionResult<{ id: string }>;
      try {
        result = await submitProjectUpdateAction(formData);
      } catch {
        result = { ok: false, error: "We couldn't reach the server. Check your connection and try again." };
      }
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        toast.error(result.error);
        const first = Object.keys(result.fieldErrors ?? {})[0];
        if (first) document.getElementsByName(first)[0]?.focus();
        return;
      }
      setErrors({});
      toast.success(result.message ?? "Progress update saved.");
      router.push(`/projects/${projectId}?tab=updates`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card-surface flex flex-col gap-5 p-5 sm:p-6">
      <input type="hidden" name="project_id" value={projectId} />

      <FormField label="Status" name="status" required error={errors.status}>
        <Select defaultValue={defaults.status} options={statusOptions} className="h-12 text-base" />
      </FormField>

      <FormField label="Progress" required error={errors.progress} hint="Drag the slider or type a number from 0 to 100.">
        {(control) => (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={progress}
                aria-label="Progress percentage slider"
                aria-describedby={control["aria-describedby"]}
                onChange={(e) => {
                  const next = clampProgress(Number(e.target.value));
                  setProgress(next);
                  setProgressText(String(next));
                }}
                className="h-11 min-w-0 flex-1 cursor-pointer accent-primary"
              />
              <div className="relative w-24 shrink-0">
                <Input
                  id={control.id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  value={progressText}
                  aria-invalid={control["aria-invalid"]}
                  aria-describedby={control["aria-describedby"]}
                  onChange={(e) => {
                    setProgressText(e.target.value);
                    if (e.target.value !== "") setProgress(clampProgress(Number(e.target.value)));
                  }}
                  onBlur={() => setProgressText(String(progress))}
                  className="h-12 pr-8 text-base tabular-nums"
                />
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
                  %
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Quick progress values">
              {[25, 50, 75, 100].map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  className="h-11 min-w-16 flex-1 sm:h-9 sm:flex-none"
                  variant={progress === value ? "secondary" : "outline"}
                  aria-pressed={progress === value}
                  onClick={() => {
                    setProgress(value);
                    setProgressText(String(value));
                  }}
                >
                  {value}%
                </Button>
              ))}
            </div>
          </div>
        )}
      </FormField>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField label="Update date" name="update_date" required error={errors.update_date}>
          <Input type="date" defaultValue={today} max={today} className="h-12 text-base" />
        </FormField>
        <FormField
          label="Expected completion"
          name="expected_completion_date"
          error={errors.expected_completion_date}
          hint="Change only if the completion date has moved."
        >
          <Input type="date" defaultValue={defaults.expectedCompletion} min={startDate ?? undefined} className="h-12 text-base" />
        </FormField>
      </div>

      <FormField label="Current milestone" name="milestone" error={errors.milestone}>
        <Select
          defaultValue={defaults.milestone}
          placeholder="Not specified"
          options={milestoneOptions.map((name) => ({ value: name, label: name }))}
          className="h-12 text-base"
        />
      </FormField>

      <FormField label="Work done / notes" name="notes" error={errors.notes}>
        <Textarea rows={3} maxLength={4000} placeholder="What was completed today?" className="text-base" />
      </FormField>
      <FormField label="Issues" name="issues" error={errors.issues} hint="Delays, site problems or anything blocking work.">
        <Textarea rows={2} maxLength={4000} className="text-base" />
      </FormField>
      <FormField label="Next action" name="next_action" error={errors.next_action}>
        <Textarea rows={2} maxLength={4000} placeholder="What happens next, and by when?" className="text-base" />
      </FormField>

      {formError ? (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-text">
          {formError}
        </p>
      ) : null}

      {/* Sticky on phones so "Save update" stays reachable on this long form (sits above the SM bottom nav). */}
      <div
        className={cn(
          "sticky bottom-[var(--bottom-nav-offset,0px)] z-20 -mx-5 -mb-5 flex gap-2 rounded-b-card border-t border-border-soft bg-surface/95 px-5 py-3 backdrop-blur",
          "sm:static sm:m-0 sm:justify-end sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none",
        )}
      >
        <Button variant="outline" size="lg" asChild className="flex-1 sm:flex-none">
          <Link href={`/projects/${projectId}`}>Cancel</Link>
        </Button>
        <Button type="submit" size="lg" loading={pending} className="flex-[2] sm:flex-none">
          Save update
        </Button>
      </div>
    </form>
  );
}
