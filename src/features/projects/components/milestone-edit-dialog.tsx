"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FieldErrors } from "@/lib/action-result";
import { MILESTONE_STATUSES, MILESTONE_STATUS_LABELS } from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import type { MilestoneStatus } from "@/types/database";
import { updateMilestoneAction } from "../actions";

export type MilestoneEditDialogProps = {
  projectId: string;
  milestone: {
    id: string;
    name: string;
    status: MilestoneStatus;
    start_date: string | null;
    target_date: string | null;
    completed_date: string | null;
    notes: string | null;
  };
};

/** Edit one milestone's status, dates and notes (rpc update_project_milestone). */
export function MilestoneEditDialog({ projectId, milestone }: MilestoneEditDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<MilestoneStatus>(milestone.status);
  const [startDate, setStartDate] = useState(milestone.start_date ?? "");
  const formId = `milestone-form-${milestone.id}`;

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setErrors({});
      setFormError(null);
      setStatus(milestone.status);
      setStartDate(milestone.start_date ?? "");
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateMilestoneAction(formData).catch(() => ({
        ok: false as const,
        error: "We couldn't reach the server. Please try again.",
        fieldErrors: undefined,
      }));
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      toast.success(result.message ?? "Milestone updated.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Edit milestone ${milestone.name}`}>
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{`Edit milestone: ${milestone.name}`}</DialogTitle>
          <DialogDescription>Update the status, dates and notes for this stage.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id={formId} onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="milestone_id" value={milestone.id} />
            <input type="hidden" name="project_id" value={projectId} />
            <FormField label="Status" name="status" required error={errors.status} className="sm:col-span-2">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as MilestoneStatus)}
                options={MILESTONE_STATUSES.map((value) => ({ value, label: MILESTONE_STATUS_LABELS[value] }))}
              />
            </FormField>
            <FormField label="Start date" name="start_date" error={errors.start_date}>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </FormField>
            <FormField label="Target date" name="target_date" error={errors.target_date}>
              <Input type="date" defaultValue={milestone.target_date ?? ""} min={startDate || undefined} />
            </FormField>
            {status === "completed" ? (
              <FormField
                label="Completed date"
                name="completed_date"
                error={errors.completed_date}
                hint="Defaults to today when left blank."
                className="sm:col-span-2"
              >
                <Input type="date" defaultValue={milestone.completed_date ?? ""} max={todayIST()} />
              </FormField>
            ) : null}
            <FormField label="Notes" name="notes" error={errors.notes} className="sm:col-span-2">
              <Textarea rows={3} defaultValue={milestone.notes ?? ""} maxLength={2000} />
            </FormField>
            {formError ? (
              <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text sm:col-span-2">
                {formError}
              </p>
            ) : null}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            Save milestone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
