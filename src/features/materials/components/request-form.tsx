"use client";

import { ExternalLink, PackagePlus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult, FieldErrors } from "@/lib/action-result";
import { MATERIAL_UNITS, PRIORITY_LABELS, PRIORITY_LEVELS } from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PriorityLevel } from "@/types/database";
import {
  createMaterialRequestAction,
  updateMaterialRequestDraftAction,
  type CreateRequestResult,
} from "../actions";
import { MAX_REQUEST_ITEMS } from "../constants";

export type RequestFormProject = { id: string; name: string; project_code: string; client_name: string };
export type RequestFormCatalogItem = { id: string; name: string; category: string | null; unit: string };

export type RequestFormItem = {
  material_id: string | null;
  material_name: string;
  category: string | null;
  quantity: number | string;
  unit: string;
  estimated_unit_cost: number | string | null;
  notes?: string | null;
};

type ItemState = {
  key: string;
  material_id: string | null;
  material_name: string;
  category: string;
  quantity: string;
  unit: string;
  estimated_unit_cost: string;
  notes: string;
};

export type RequestFormProps =
  | {
      mode: "create";
      projects: readonly RequestFormProject[];
      defaultProjectId?: string;
      catalog: readonly RequestFormCatalogItem[];
      categories: readonly string[];
      cancelHref: string;
    }
  | {
      mode: "edit";
      requestId: string;
      projectLabel: string;
      catalog: readonly RequestFormCatalogItem[];
      categories: readonly string[];
      initial: {
        title: string;
        required_date: string;
        priority: PriorityLevel;
        notes: string | null;
        items: readonly RequestFormItem[];
      };
      cancelHref: string;
    };

let keySeed = 0;
const nextKey = () => `item-${Date.now().toString(36)}-${(keySeed++).toString(36)}`;

function emptyItem(): ItemState {
  return { key: nextKey(), material_id: null, material_name: "", category: "", quantity: "", unit: "", estimated_unit_cost: "", notes: "" };
}

function toItemState(item: RequestFormItem): ItemState {
  return {
    key: nextKey(),
    material_id: item.material_id,
    material_name: item.material_name,
    category: item.category ?? "",
    quantity: String(item.quantity),
    unit: item.unit,
    estimated_unit_cost: item.estimated_unit_cost === null || item.estimated_unit_cost === undefined ? "" : String(item.estimated_unit_cost),
    notes: item.notes ?? "",
  };
}

function toNumber(value: string): number | null {
  const cleaned = value.replace(/[,\s₹]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function suggestTitle(items: readonly ItemState[]): string {
  const names = items.map((item) => item.material_name.trim()).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  return `${names[0]} + ${names.length - 1} more`;
}

const NETWORK_ERROR = "We couldn't reach the server. Check your connection and try again.";

/** Mobile-first material request form (create + edit draft). */
export function RequestForm(props: RequestFormProps) {
  const router = useRouter();
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const today = todayIST();
  const isEdit = props.mode === "edit";

  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string>(
    props.mode === "create"
      ? (props.projects.find((p) => p.id === props.defaultProjectId)?.id ?? (props.projects.length === 1 ? (props.projects[0]?.id ?? "") : ""))
      : "",
  );
  const [title, setTitle] = useState(isEdit ? props.initial.title : "");
  const [titleTouched, setTitleTouched] = useState(isEdit);
  const [requiredDate, setRequiredDate] = useState(isEdit ? props.initial.required_date : "");
  const [priority, setPriority] = useState<PriorityLevel>(isEdit ? props.initial.priority : "medium");
  const [notes, setNotes] = useState(isEdit ? (props.initial.notes ?? "") : "");
  const [items, setItems] = useState<ItemState[]>(() =>
    isEdit && props.initial.items.length > 0 ? props.initial.items.map(toItemState) : [emptyItem()],
  );
  const [duplicate, setDuplicate] = useState<Extract<CreateRequestResult, { kind: "duplicate" }> | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const catalogOptions = useMemo<ComboboxOption[]>(
    () =>
      props.catalog.map((item) => ({
        value: item.name,
        description: [item.category, item.unit].filter(Boolean).join(" · ") || undefined,
      })),
    [props.catalog],
  );
  const unitOptions = useMemo<ComboboxOption[]>(() => MATERIAL_UNITS.map((unit) => ({ value: unit })), []);
  /**
   * Active categories, plus ones already in use by catalog materials or the request
   * being edited (they may have been hidden since). Typed text never becomes an option.
   */
  const categoryOptions = useMemo<ComboboxOption[]>(() => {
    const names = [...props.categories];
    const known = new Set(names.map((name) => name.toLowerCase()));
    const inUse = [
      ...props.catalog.map((item) => item.category),
      ...(props.mode === "edit" ? props.initial.items.map((item) => item.category) : []),
    ];
    for (const raw of inUse) {
      const name = raw?.trim();
      if (name && !known.has(name.toLowerCase())) {
        known.add(name.toLowerCase());
        names.push(name);
      }
    }
    return names.map((name) => ({ value: name }));
  }, [props]);

  const catalogByName = useMemo(() => {
    const map = new Map<string, RequestFormCatalogItem>();
    for (const item of props.catalog) map.set(item.name.trim().toLowerCase(), item);
    return map;
  }, [props.catalog]);

  const estimatedTotal = items.reduce((sum, item) => {
    const qty = toNumber(item.quantity);
    const cost = toNumber(item.estimated_unit_cost);
    return qty !== null && cost !== null ? sum + qty * cost : sum;
  }, 0);
  const hasAnyCost = items.some((item) => toNumber(item.estimated_unit_cost) !== null);
  const titleSuggestion = suggestTitle(items);
  const effectiveTitle = titleTouched ? title : title || titleSuggestion;

  function updateItem(key: string, patch: Partial<ItemState>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function onMaterialChange(key: string, value: string) {
    const match = catalogByName.get(value.trim().toLowerCase());
    setItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        if (match) {
          return {
            ...item,
            material_name: match.name,
            material_id: match.id,
            category: match.category ?? item.category,
            unit: match.unit,
          };
        }
        return { ...item, material_name: value, material_id: null };
      }),
    );
  }

  function addItem() {
    if (items.length >= MAX_REQUEST_ITEMS) return;
    setItems((current) => [...current, emptyItem()]);
    // Focus the new row's material input after render.
    requestAnimationFrame(() => {
      const inputs = formRef.current?.querySelectorAll<HTMLInputElement>("input[data-material-input]");
      inputs?.[inputs.length - 1]?.focus();
    });
  }

  function removeItem(key: string) {
    setItems((current) => (current.length <= 1 ? current : current.filter((item) => item.key !== key)));
  }

  function itemPayload() {
    return items.map((item) => ({
      material_id: item.material_id,
      material_name: item.material_name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      estimated_unit_cost: item.estimated_unit_cost,
      notes: item.notes,
    }));
  }

  function handleFailure(result: Extract<ActionResult<unknown>, { ok: false }>) {
    setErrors(result.fieldErrors ?? {});
    setFormError(result.error);
    toast.error(result.error);
    const first = Object.keys(result.fieldErrors ?? {})[0];
    if (first) {
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${CSS.escape(first)}"]`);
      el?.focus();
    }
  }

  function submit(allowDuplicate: boolean) {
    setFormError(null);
    startTransition(async () => {
      if (props.mode === "create") {
        let result: ActionResult<CreateRequestResult>;
        try {
          result = await createMaterialRequestAction({
            project_id: projectId,
            title: effectiveTitle,
            required_date: requiredDate,
            priority,
            notes,
            items: itemPayload(),
            allow_duplicate: allowDuplicate,
          });
        } catch {
          result = { ok: false, error: NETWORK_ERROR };
        }
        if (!result.ok) {
          setDuplicate(null);
          handleFailure(result);
          return;
        }
        if (result.data.kind === "duplicate") {
          setErrors({});
          setDuplicate(result.data);
          return;
        }
        setDuplicate(null);
        setErrors({});
        toast.success(result.message ?? "Material request submitted.");
        router.push(`/material-requests/${result.data.id}`);
        router.refresh();
        return;
      }

      let result: ActionResult<{ id: string }>;
      try {
        result = await updateMaterialRequestDraftAction({
          request_id: props.requestId,
          original_required_date: props.initial.required_date,
          title: effectiveTitle,
          required_date: requiredDate,
          priority,
          notes,
          items: itemPayload(),
        });
      } catch {
        result = { ok: false, error: NETWORK_ERROR };
      }
      if (!result.ok) {
        handleFailure(result);
        return;
      }
      setErrors({});
      toast.success(result.message ?? "Request updated.");
      router.push(`/material-requests/${props.requestId}`);
      router.refresh();
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(false);
  }

  const err = (key: string) => errors[key];
  const projectOptions =
    props.mode === "create"
      ? props.projects.map((p) => ({ value: p.id, label: `${p.name} (${p.project_code}) · ${p.client_name}` }))
      : [];

  return (
    <>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <section className="card-surface flex flex-col gap-5 p-5 sm:p-6" aria-labelledby={`${baseId}-details`}>
          <h2 id={`${baseId}-details`} className="text-lg font-semibold tracking-tight text-text">
            Request details
          </h2>

          {props.mode === "create" ? (
            <FormField label="Project" required error={err("project_id")}>
              <Select
                data-field="project_id"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="Select a project"
                options={projectOptions}
                className="h-12 text-base"
              />
            </FormField>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-text">Project</span>
              <p className="rounded-xl bg-surface-muted px-3.5 py-3 text-sm text-text">{props.projectLabel}</p>
            </div>
          )}

          <FormField
            label="Title"
            required
            error={err("title")}
            hint={!titleTouched && titleSuggestion ? "Suggested from your first item — edit if you like." : undefined}
          >
            <Input
              data-field="title"
              value={effectiveTitle}
              maxLength={200}
              placeholder="e.g. Cement for first-floor slab"
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
              }}
              className="h-12 text-base"
            />
          </FormField>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField label="Required date" required error={err("required_date")}>
              <Input
                data-field="required_date"
                type="date"
                min={isEdit && props.initial.required_date < today ? props.initial.required_date : today}
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
                className="h-12 text-base"
              />
            </FormField>
            <FormField label="Priority" required error={err("priority")}>
              <Select
                data-field="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                options={PRIORITY_LEVELS.map((value) => ({ value, label: PRIORITY_LABELS[value] }))}
                className="h-12 text-base"
              />
            </FormField>
          </div>
        </section>

        <section className="card-surface flex flex-col gap-4 p-5 sm:p-6" aria-labelledby={`${baseId}-items`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id={`${baseId}-items`} className="text-lg font-semibold tracking-tight text-text">
                Materials
              </h2>
              <p className="text-sm text-muted">Pick from the catalog or type any material name.</p>
            </div>
            <span className="text-sm text-muted tabular-nums">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>

          {err("items") ? (
            <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text">
              {err("items")?.[0]}
            </p>
          ) : null}

          <ol className="flex flex-col gap-4">
            {items.map((item, index) => {
              const qty = toNumber(item.quantity);
              const cost = toNumber(item.estimated_unit_cost);
              const lineTotal = qty !== null && cost !== null ? qty * cost : null;
              const prefix = `items.${index}`;
              return (
                <li
                  key={item.key}
                  className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-surface-muted/50 p-4"
                  aria-label={`Item ${index + 1}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-text">Item {index + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeItem(item.key)}
                      disabled={items.length <= 1}
                      aria-label={`Remove item ${index + 1}`}
                      className="size-11 text-muted hover:text-danger-text sm:size-8"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-12">
                    <FormField
                      label="Material"
                      required
                      error={err(`${prefix}.material_name`)}
                      className="col-span-2 sm:col-span-5"
                      hint={item.material_id ? "From catalog" : undefined}
                    >
                      <Combobox
                        data-field={`${prefix}.material_name`}
                        data-material-input=""
                        listLabel="Materials"
                        options={catalogOptions}
                        emptyMessage="Not in the catalog — it will be requested as typed."
                        value={item.material_name}
                        maxLength={160}
                        placeholder="Search catalog or type"
                        onValueChange={(value) => onMaterialChange(item.key, value)}
                        className="h-12 text-base"
                      />
                    </FormField>
                    <FormField label="Category" error={err(`${prefix}.category`)} className="col-span-2 sm:col-span-3">
                      <Combobox
                        data-field={`${prefix}.category`}
                        listLabel="Categories"
                        options={categoryOptions}
                        allowCustom={false}
                        emptyMessage="No category matches. The owner manages categories in Settings."
                        value={item.category}
                        maxLength={80}
                        placeholder="Select category"
                        onValueChange={(value) => updateItem(item.key, { category: value })}
                        className="h-12 text-base"
                      />
                    </FormField>
                    <FormField label="Quantity" required error={err(`${prefix}.quantity`)} className="sm:col-span-2">
                      <Input
                        data-field={`${prefix}.quantity`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                        className="h-12 text-base"
                      />
                    </FormField>
                    <FormField label="Unit" required error={err(`${prefix}.unit`)} className="sm:col-span-2">
                      <Combobox
                        data-field={`${prefix}.unit`}
                        listLabel="Units"
                        options={unitOptions}
                        value={item.unit}
                        maxLength={32}
                        placeholder="Bags"
                        onValueChange={(value) => updateItem(item.key, { unit: value })}
                        className="h-12 text-base"
                      />
                    </FormField>
                    <FormField
                      label="Est. unit cost (₹)"
                      error={err(`${prefix}.estimated_unit_cost`)}
                      className="col-span-2 sm:col-span-4"
                      hint="Optional"
                    >
                      <Input
                        data-field={`${prefix}.estimated_unit_cost`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={item.estimated_unit_cost}
                        onChange={(e) => updateItem(item.key, { estimated_unit_cost: e.target.value })}
                        className="h-12 text-base"
                      />
                    </FormField>
                    <FormField label="Item note" error={err(`${prefix}.notes`)} className="col-span-2 sm:col-span-5">
                      <Input
                        data-field={`${prefix}.notes`}
                        value={item.notes}
                        maxLength={500}
                        placeholder="Brand, size, colour…"
                        onChange={(e) => updateItem(item.key, { notes: e.target.value })}
                        className="h-12 text-base"
                      />
                    </FormField>
                    <div className="col-span-2 flex flex-col justify-end gap-1 sm:col-span-3">
                      <span className="text-xs font-medium text-muted">Line total</span>
                      <span
                        className={cn("flex h-12 items-center text-base font-semibold tabular-nums", lineTotal === null ? "text-muted" : "text-text")}
                        aria-live="polite"
                      >
                        {lineTotal === null ? "—" : formatINR(lineTotal)}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={addItem}
            disabled={items.length >= MAX_REQUEST_ITEMS}
            className="w-full sm:w-fit"
          >
            <Plus aria-hidden="true" />
            Add another item
          </Button>
        </section>

        <section className="card-surface flex flex-col gap-4 p-5 sm:p-6">
          <FormField label="Notes" error={err("notes")} hint="Where it is needed, delivery instructions, anything the admin should know.">
            <Textarea
              data-field="notes"
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Required for first-floor work."
              className="text-base"
            />
          </FormField>
        </section>

        {formError ? (
          <p role="alert" className="rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-text">
            {formError}
          </p>
        ) : null}

        {/* Sticky so the total and submit stay in reach while adding items (sits above the SM bottom nav). */}
        <div className="card-surface sticky bottom-[calc(var(--bottom-nav-offset,0px)_+_0.5rem)] z-20 flex items-center gap-3 p-3 shadow-pop sm:p-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Estimated total</p>
            <p className="truncate text-base font-bold tabular-nums text-text sm:text-lg">
              {hasAnyCost ? formatINR(estimatedTotal) : <span className="text-sm font-medium text-muted">Not estimated</span>}
            </p>
          </div>
          <Button variant="outline" size="lg" asChild className="hidden sm:inline-flex">
            <Link href={props.cancelHref}>Cancel</Link>
          </Button>
          <Button type="submit" size="lg" loading={pending} className="shrink-0 px-4 sm:px-6">
            <PackagePlus aria-hidden="true" />
            {isEdit ? "Save changes" : "Submit request"}
          </Button>
        </div>
      </form>

      <Dialog open={duplicate !== null} onOpenChange={(open) => (!open && !pending ? setDuplicate(null) : undefined)}>
        <DialogContent size="sm" role="alertdialog" hideClose={pending}>
          <DialogHeader>
            <DialogTitle>Similar request already open</DialogTitle>
            <DialogDescription>{duplicate?.message}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3 text-sm text-muted">
            <p>
              Check the open request first to avoid ordering the same material twice. If this is genuinely a separate
              requirement, submit it anyway.
            </p>
            {duplicate?.existing ? (
              <Link
                href={`/material-requests/${duplicate.existing.id}`}
                target="_blank"
                className="inline-flex w-fit items-center gap-1.5 font-semibold text-primary-strong hover:underline"
              >
                View {duplicate.existing.code}
                <ExternalLink aria-hidden="true" className="size-4" />
                <span className="sr-only">(opens in a new tab)</span>
              </Link>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicate(null)} disabled={pending}>
              Go back
            </Button>
            <Button onClick={() => submit(true)} loading={pending}>
              Submit anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
