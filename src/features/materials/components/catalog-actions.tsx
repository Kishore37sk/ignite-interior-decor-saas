"use client";

import { Pencil, Plus, Power, PowerOff } from "lucide-react";
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { FieldErrors } from "@/lib/action-result";
import { MATERIAL_UNITS } from "@/lib/constants";
import { saveCatalogItemAction, setCatalogItemActiveAction } from "../actions";
import { useActionRunner } from "./use-action-runner";

const UNIT_OPTIONS = MATERIAL_UNITS.map((unit) => ({ value: unit }));

/** Active categories, plus the saved item's category if it was since hidden (never typed text). */
function categoryOptions(categories: readonly string[], saved: string | null | undefined) {
  const names = [...categories];
  const name = saved?.trim();
  if (name && !names.some((existing) => existing.toLowerCase() === name.toLowerCase())) names.push(name);
  return names.map((value) => ({ value }));
}

export type CatalogItemValues = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  description: string | null;
  is_active: boolean;
};

type CatalogItemDialogProps = {
  item?: CatalogItemValues;
  categories: readonly string[];
  trigger: ReactNode;
};

/** Add / edit a catalog material (owner & admin). */
export function CatalogItemDialog({ item, categories, trigger }: CatalogItemDialogProps) {
  const run = useActionRunner();
  const baseId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(() => toState(item));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function toState(source?: CatalogItemValues) {
    return {
      name: source?.name ?? "",
      category: source?.category ?? "",
      unit: source?.unit ?? "",
      description: source?.description ?? "",
      is_active: source?.is_active ?? true,
    };
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await run(
        () => saveCatalogItemAction({ id: item?.id ?? null, ...values }),
        item ? "Material updated." : "Material added to the catalog.",
      );
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          setValues(toState(item));
          setErrors({});
          setFormError(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent size="md" hideClose={pending}>
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{item ? `Edit ${item.name}` : "Add material"}</DialogTitle>
            <DialogDescription>Catalog materials can be picked quickly when raising a request.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <FormField label="Name" required error={errors.name}>
              <Input value={values.name} maxLength={160} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} placeholder="e.g. OPC Cement 53 Grade" />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Category" error={errors.category}>
                <Combobox
                  listLabel="Categories"
                  options={categoryOptions(categories, item?.category)}
                  allowCustom={false}
                  emptyMessage="No category matches. Manage categories in Settings."
                  maxLength={80}
                  placeholder="Select category"
                  value={values.category}
                  onValueChange={(category) => setValues((v) => ({ ...v, category }))}
                />
              </FormField>
              <FormField label="Unit" required error={errors.unit}>
                <Combobox
                  listLabel="Units"
                  options={UNIT_OPTIONS}
                  maxLength={32}
                  value={values.unit}
                  onValueChange={(unit) => setValues((v) => ({ ...v, unit }))}
                  placeholder="Bags"
                />
              </FormField>
            </div>
            <FormField label="Description" error={errors.description}>
              <Textarea rows={3} maxLength={1000} value={values.description} onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))} />
            </FormField>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-surface-muted px-4 py-3">
              <label htmlFor={`${baseId}-active`} className="text-sm">
                <span className="font-medium text-text">Active</span>
                <span className="block text-xs text-muted">Inactive materials can&apos;t be picked for new requests.</span>
              </label>
              <Switch id={`${baseId}-active`} checked={values.is_active} onCheckedChange={(checked) => setValues((v) => ({ ...v, is_active: checked }))} />
            </div>
            {formError ? (
              <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text">
                {formError}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {item ? "Save changes" : "Add material"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddMaterialButton({ categories }: { categories: readonly string[] }) {
  return (
    <CatalogItemDialog
      categories={categories}
      trigger={
        <Button>
          <Plus aria-hidden="true" />
          Add material
        </Button>
      }
    />
  );
}

/** Edit + deactivate/reactivate controls for a catalog row. */
export function CatalogRowActions({ item, categories }: { item: CatalogItemValues; categories: readonly string[] }) {
  const run = useActionRunner();
  return (
    <div className="flex items-center gap-1">
      <CatalogItemDialog
        item={item}
        categories={categories}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.name}`}>
            <Pencil aria-hidden="true" />
          </Button>
        }
      />
      {item.is_active ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Deactivate ${item.name}`} className="text-danger-text hover:bg-danger-bg">
              <PowerOff aria-hidden="true" />
            </Button>
          }
          title={`Deactivate ${item.name}?`}
          description="It stays on existing requests but can't be picked for new ones. You can reactivate it any time."
          confirmLabel="Deactivate"
          destructive
          onConfirm={() => run(() => setCatalogItemActiveAction({ id: item.id, is_active: false }), "Material deactivated.")}
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Reactivate ${item.name}`} className="text-primary-strong">
              <Power aria-hidden="true" />
            </Button>
          }
          title={`Reactivate ${item.name}?`}
          description="It will be available again when raising material requests."
          confirmLabel="Reactivate"
          onConfirm={() => run(() => setCatalogItemActiveAction({ id: item.id, is_active: true }), "Material reactivated.")}
        />
      )}
    </div>
  );
}
