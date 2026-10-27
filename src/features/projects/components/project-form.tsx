"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, FieldErrors } from "@/lib/action-result";
import {
  PAYMENT_MODES,
  PAYMENT_MODE_LABELS,
  PRIORITY_LABELS,
  PRIORITY_LEVELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
} from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/format";
import type { PriorityLevel, ProjectStatus } from "@/types/database";
import { createProjectAction, updateProjectAction, type ProjectSaveResult } from "../actions";
import { PROJECT_TYPE_SUGGESTIONS } from "../constants";
import { ClientCombobox, type ClientOption } from "./client-combobox";

const PROJECT_TYPE_OPTIONS = PROJECT_TYPE_SUGGESTIONS.map((type) => ({ value: type }));

export type ProjectFormDefaults = {
  client_id: string;
  name: string;
  project_code: string;
  project_type: string;
  site_address: string;
  city: string;
  start_date: string;
  expected_completion_date: string;
  handover_date: string;
  actual_handover_date: string;
  status: ProjectStatus;
  priority: PriorityLevel;
  progress_percentage: string;
  notes: string;
  project_cost: string;
  advance_received: string;
  site_manager_id: string;
};

export type SiteManagerOption = { id: string; label: string };

export type ProjectFormProps = {
  mode: "create" | "edit";
  projectId?: string;
  defaults: ProjectFormDefaults;
  clients: readonly ClientOption[];
  siteManagers: readonly SiteManagerOption[];
  cancelHref: string;
  /** Edit mode: amount received so far (payments are managed on the Payments tab). */
  receivedSoFar?: number;
};

/** Owner project create/edit form (project, dates, status, cost, site manager). */
export function ProjectForm({ mode, projectId, defaults, clients, siteManagers, cancelHref, receivedSoFar = 0 }: ProjectFormProps) {
  const router = useRouter();
  const [projectType, setProjectType] = useState(defaults.project_type);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(defaults.start_date);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFormError(null);
    startTransition(async () => {
      let result: ActionResult<ProjectSaveResult>;
      try {
        result =
          mode === "edit" && projectId
            ? await updateProjectAction(projectId, formData)
            : await createProjectAction(formData);
      } catch {
        result = { ok: false, error: "We couldn't reach the server. Check your connection and try again." };
      }
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        toast.error(result.error);
        const first = Object.keys(result.fieldErrors ?? {})[0];
        if (first) document.getElementsByName(first)[0]?.focus();
        return;
      }
      setFieldErrors({});
      if (result.data.warning) toast.warning(result.message ?? "Saved with warnings.", { duration: 10000 });
      else toast.success(result.message ?? "Project saved.");
      router.push(`/projects/${result.data.id}`);
      router.refresh();
    });
  }

  const err = (field: string) => fieldErrors[field];

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <section aria-labelledby="project-basics" className="card-surface flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 id="project-basics" className="text-lg font-semibold text-text">
            Project
          </h2>
          <p className="mt-1 text-sm text-muted">Who the project is for and where the site is.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormField label="Client" required error={err("client_id")} className="md:col-span-2">
            {(control) => (
              <ClientCombobox
                id={control.id}
                name="client_id"
                options={clients}
                defaultValue={defaults.client_id}
                invalid={Boolean(control["aria-invalid"])}
                describedBy={control["aria-describedby"]}
                required
              />
            )}
          </FormField>
          <FormField label="Project name" name="name" required error={err("name")}>
            <Input defaultValue={defaults.name} maxLength={160} placeholder="e.g. Kumar Residence — 3BHK Interiors" />
          </FormField>
          <FormField
            label="Project code"
            name="project_code"
            error={err("project_code")}
            hint={mode === "create" ? "Leave blank to auto-generate (P-1001…)." : "Leave blank to keep the current code."}
          >
            <Input defaultValue={defaults.project_code} maxLength={20} className="uppercase" autoCapitalize="characters" />
          </FormField>
          <FormField label="Project type" name="project_type" error={err("project_type")} hint="Pick a suggestion or type your own.">
            <Combobox
              listLabel="Project types"
              options={PROJECT_TYPE_OPTIONS}
              value={projectType}
              onValueChange={setProjectType}
              maxLength={60}
            />
          </FormField>
          <FormField label="City" name="city" error={err("city")}>
            <Input defaultValue={defaults.city} maxLength={80} autoComplete="address-level2" />
          </FormField>
          <FormField label="Site address" name="site_address" error={err("site_address")} className="md:col-span-2">
            <Textarea rows={2} defaultValue={defaults.site_address} maxLength={500} />
          </FormField>
        </div>
      </section>

      <section aria-labelledby="project-schedule" className="card-surface flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 id="project-schedule" className="text-lg font-semibold text-text">
            Schedule & status
          </h2>
          <p className="mt-1 text-sm text-muted">
            Deadline indicators are calculated from the expected completion date; the status is always set manually.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormField label="Start date" name="start_date" error={err("start_date")}>
            <Input type="date" defaultValue={defaults.start_date} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="Expected completion" name="expected_completion_date" error={err("expected_completion_date")}>
            <Input type="date" defaultValue={defaults.expected_completion_date} min={startDate || undefined} />
          </FormField>
          <FormField label="Handover date" name="handover_date" error={err("handover_date")}>
            <Input type="date" defaultValue={defaults.handover_date} min={startDate || undefined} />
          </FormField>
          <FormField label="Actual handover" name="actual_handover_date" error={err("actual_handover_date")} hint="Fill in once the site is handed over.">
            <Input type="date" defaultValue={defaults.actual_handover_date} min={startDate || undefined} max={todayIST()} />
          </FormField>
          <FormField label="Status" name="status" required error={err("status")}>
            <Select
              defaultValue={defaults.status}
              options={PROJECT_STATUSES.map((value) => ({ value, label: PROJECT_STATUS_LABELS[value] }))}
            />
          </FormField>
          <FormField label="Priority" name="priority" required error={err("priority")}>
            <Select
              defaultValue={defaults.priority}
              options={PRIORITY_LEVELS.map((value) => ({ value, label: PRIORITY_LABELS[value] }))}
            />
          </FormField>
          <FormField label="Progress (%)" name="progress_percentage" required error={err("progress_percentage")}>
            <Input type="number" inputMode="decimal" min={0} max={100} step="1" defaultValue={defaults.progress_percentage} />
          </FormField>
          <FormField
            label="Site manager"
            name="site_manager_id"
            error={err("site_manager_id")}
            hint={siteManagers.length === 0 ? "No active site managers yet — add one under Site Managers." : "Choosing someone new replaces the current site manager. Extra site managers are managed in the Team card on the project's Overview tab."}
          >
            <Select defaultValue={defaults.site_manager_id} placeholder="Not assigned" options={siteManagers.map((sm) => ({ value: sm.id, label: sm.label }))} />
          </FormField>
        </div>
      </section>

      <section aria-labelledby="project-money" className="card-surface flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 id="project-money" className="text-lg font-semibold text-text">
            Cost & notes
          </h2>
          <p className="mt-1 text-sm text-muted">Project cost is visible only to you and members you explicitly allow.</p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormField label="Project cost (₹)" name="project_cost" error={err("project_cost")}>
            <Input inputMode="decimal" defaultValue={defaults.project_cost} leading={<span className="text-sm">₹</span>} placeholder="0" />
          </FormField>
          {mode === "create" ? (
            <>
              <FormField label="Advance received (₹)" name="advance_received" error={err("advance_received")}>
                <Input inputMode="decimal" defaultValue={defaults.advance_received} leading={<span className="text-sm">₹</span>} placeholder="0" />
              </FormField>
              <FormField
                label="Advance paid by"
                name="advance_mode"
                error={err("advance_mode")}
                hint="Saved as the first payment. Add later payments from the project's Payments tab."
              >
                <Select
                  defaultValue=""
                  placeholder="Choose a mode"
                  options={PAYMENT_MODES.map((value) => ({ value, label: PAYMENT_MODE_LABELS[value] }))}
                />
              </FormField>
            </>
          ) : (
            <div className="flex flex-col gap-1 rounded-xl bg-surface-muted p-4">
              <span className="text-xs font-medium text-muted">Received so far</span>
              <span className="text-base font-semibold tabular-nums text-text">{formatINR(receivedSoFar)}</span>
              <Link href={`/projects/${projectId}?tab=payments`} className="w-fit text-sm font-medium text-primary-strong hover:underline">
                Manage payments
              </Link>
            </div>
          )}
          <FormField label="Notes" name="notes" error={err("notes")} className="md:col-span-2">
            <Textarea rows={4} defaultValue={defaults.notes} maxLength={4000} />
          </FormField>
        </div>
      </section>

      {formError ? (
        <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-text">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button type="submit" loading={pending}>
          {mode === "create" ? "Create project" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
