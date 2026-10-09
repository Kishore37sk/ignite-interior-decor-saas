"use client";

import { ArrowRightLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { ROLE_LABELS } from "@/lib/constants";
import { reassignProjectsAction } from "../actions";
import type { StaffRole } from "../schemas";

export type ReassignProjectsDialogProps = {
  fromUser: { id: string; full_name: string; role: StaffRole; status: "active" | "inactive" };
  projects: { id: string; name: string; project_code: string }[];
  candidates: { id: string; full_name: string; employee_id: string | null }[];
};

/** Move a user's active project assignments to another active user of the same role. */
export function ReassignProjectsDialog({ fromUser, projects, candidates }: ReassignProjectsDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(projects.map((p) => p.id)));
  const [error, setError] = useState<string | null>(null);
  const roleLabel = ROLE_LABELS[fromUser.role].toLowerCase();

  function change(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setSelected(new Set(projects.map((p) => p.id)));
      setTarget("");
      setError(null);
    }
  }

  function submit() {
    if (!target) {
      setError(`Choose the ${roleLabel} who takes over.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await reassignProjectsAction({
          from_user_id: fromUser.id,
          to_user_id: target,
          project_ids: [...selected],
        });
        if (!res.ok) {
          setError(res.fieldErrors?.to_user_id?.[0] ?? res.error);
          toast.error(res.error);
          return;
        }
        toast.success(res.message ?? "Projects reassigned.");
        setOpen(false);
        router.refresh();
      } catch {
        const message = "We couldn't reach the server. Check your connection and try again.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button variant={fromUser.status === "inactive" ? "primary" : "outline"}>
          <ArrowRightLeft aria-hidden="true" />
          Reassign projects
        </Button>
      </DialogTrigger>
      <DialogContent size="md" hideClose={pending} onInteractOutside={(e) => pending && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Reassign {fromUser.full_name}&apos;s projects</DialogTitle>
          <DialogDescription>
            The new {roleLabel} is assigned and {fromUser.full_name} is marked as removed on each selected project. Past
            updates and requests keep their original author. Financial access is not carried over — grant it from the project team if needed.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {candidates.length === 0 ? (
            <p className="rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning-text">
              There is no other active {roleLabel}. Add one from Users first.
            </p>
          ) : (
            <FormField label={`New ${roleLabel}`} required error={error && !target ? error : undefined}>
              <Select
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder={`Select a ${roleLabel}…`}
                options={candidates.map((c) => ({
                  value: c.id,
                  label: c.employee_id ? `${c.full_name} (${c.employee_id})` : c.full_name,
                }))}
              />
            </FormField>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-text">{`Projects (${selected.size} of ${projects.length})`}</legend>
            <ul className="flex max-h-64 flex-col divide-y divide-border-soft overflow-y-auto rounded-xl border border-border-soft">
              {projects.map((project) => {
                const id = `reassign-${project.id}`;
                return (
                  <li key={project.id}>
                    <label htmlFor={id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface-muted">
                      <Checkbox
                        id={id}
                        checked={selected.has(project.id)}
                        disabled={pending}
                        onCheckedChange={(value) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (value === true) next.add(project.id);
                            else next.delete(project.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 truncate text-sm">
                        <span className="font-medium text-text">{project.name}</span>
                        <span className="text-muted">{` · ${project.project_code}`}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          {error && target ? (
            <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => change(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={pending}
            loadingText="Reassigning…"
            disabled={candidates.length === 0 || selected.size === 0}
          >
            Reassign {selected.size} project{selected.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
