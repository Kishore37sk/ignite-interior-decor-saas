"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FieldErrors } from "@/lib/action-result";
import { todayIST } from "@/lib/dates";
import { formatINR, formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  assignRequestAction,
  changeRequestStatusAction,
  recordDeliveryAction,
  updateDeliveryDateAction,
  updateRequestCostsAction,
} from "../actions";
import { useActionRunner } from "./use-action-runner";

export type WorkflowItem = {
  id: string;
  material_name: string;
  unit: string;
  quantity: number;
  delivered_quantity: number;
  estimated_unit_cost: number | null;
  approved_unit_cost: number | null;
  actual_unit_cost: number | null;
};

function num(value: string): number | null {
  const cleaned = value.replace(/[,\s₹]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const str = (value: number | null) => (value === null || value === undefined ? "" : String(value));

type FormDialogProps = {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  submitLabel: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** Return true to close. */
  onSubmit: () => Promise<boolean>;
  onOpen?: () => void;
  children: ReactNode;
  formError: string | null;
};

/** Dialog wrapper with a form, loading state and a non-dismissable pending phase. */
function FormDialog({ trigger, title, description, submitLabel, size = "md", onSubmit, onOpen, children, formError }: FormDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      if (await onSubmit()) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) onOpen?.();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        size={size}
        hideClose={pending}
        {...(description ? {} : { "aria-describedby": undefined })}
        onInteractOutside={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <form onSubmit={handle} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            {children}
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
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Mark ordered                                                               */
/* -------------------------------------------------------------------------- */

export function MarkOrderedDialog({ requestId, trigger, defaultExpected }: { requestId: string; trigger: ReactNode; defaultExpected: string | null }) {
  const run = useActionRunner();
  const today = todayIST();
  const [expected, setExpected] = useState(defaultExpected && defaultExpected >= today ? defaultExpected : "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <FormDialog
      trigger={trigger}
      title="Mark as ordered"
      description="Record that the material has been ordered with the supplier."
      submitLabel="Mark ordered"
      formError={formError}
      onOpen={() => {
        setErrors({});
        setFormError(null);
      }}
      onSubmit={async () => {
        const result = await run(
          () => changeRequestStatusAction({ request_id: requestId, status: "ordered", expected_delivery_date: expected, note }),
          "Marked as ordered.",
        );
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          setFormError(result.error);
          return false;
        }
        setNote("");
        return true;
      }}
    >
      <FormField label="Expected delivery date" error={errors.expected_delivery_date} hint="Optional — helps the site plan work.">
        <Input type="date" min={today} value={expected} onChange={(e) => setExpected(e.target.value)} />
      </FormField>
      <FormField label="Note" error={errors.note} hint="Supplier, PO number or anything useful. Added to the comments.">
        <Textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </FormField>
    </FormDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Expected delivery date                                                     */
/* -------------------------------------------------------------------------- */

export function DeliveryDateDialog({ requestId, trigger, current }: { requestId: string; trigger: ReactNode; current: string | null }) {
  const run = useActionRunner();
  const today = todayIST();
  const initialDate = () => (current && current >= todayIST() ? current : "");
  const [date, setDate] = useState(initialDate);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <FormDialog
      trigger={trigger}
      title="Update delivery date"
      description="Revise when the material is expected on site. The requester is notified."
      submitLabel="Save date"
      size="sm"
      formError={formError}
      onOpen={() => {
        setDate(initialDate());
        setNote("");
        setErrors({});
        setFormError(null);
      }}
      onSubmit={async () => {
        if (!date) {
          setErrors({ expected_delivery_date: ["Choose the expected delivery date."] });
          setFormError(null);
          return false;
        }
        const result = await run(
          () => updateDeliveryDateAction({ request_id: requestId, expected_delivery_date: date, note }),
          "Expected delivery date updated.",
        );
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          setFormError(result.error);
          return false;
        }
        return true;
      }}
    >
      <FormField label="Expected delivery date" required error={errors.expected_delivery_date}>
        <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>
      <FormField label="Note" error={errors.note} hint="Optional — e.g. the reason for the change. Added to the comments.">
        <Textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
      </FormField>
    </FormDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Costs                                                                      */
/* -------------------------------------------------------------------------- */

type CostRow = { estimated: string; approved: string; actual: string };

const COST_FIELDS = [
  ["estimated", "estimated_unit_cost"],
  ["approved", "approved_unit_cost"],
  ["actual", "actual_unit_cost"],
] as const;

const sameAmount = (a: string, b: string) => a.trim() === b.trim() || (num(a) !== null && num(a) === num(b));

type CostChange = { item_id: string; estimated_unit_cost?: string; approved_unit_cost?: string; actual_unit_cost?: string };

export function CostsDialog({ requestId, items, trigger }: { requestId: string; items: readonly WorkflowItem[]; trigger: ReactNode }) {
  const run = useActionRunner();
  const initial = () =>
    Object.fromEntries(
      items.map((item) => [
        item.id,
        { estimated: str(item.estimated_unit_cost), approved: str(item.approved_unit_cost), actual: str(item.actual_unit_cost) },
      ]),
    ) as Record<string, CostRow>;
  const [rows, setRows] = useState<Record<string, CostRow>>(initial);
  // Values when the dialog opened: only fields that differ from these are sent, so a
  // stale dialog never overwrites costs another user saved in the meantime.
  const [baseline, setBaseline] = useState<Record<string, CostRow>>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const changes = items
    .map((item) => {
      const row = rows[item.id];
      const base = baseline[item.id];
      const entry: CostChange = { item_id: item.id };
      if (!row) return entry;
      for (const [key, field] of COST_FIELDS) {
        if (!base || !sameAmount(row[key], base[key])) entry[field] = row[key];
      }
      return entry;
    })
    .filter((entry) => Object.keys(entry).length > 1);
  // Field errors are keyed by position in the payload (changed items only).
  const payloadIndex = new Map(changes.map((entry, index) => [entry.item_id, index]));

  const totals = items.reduce(
    (acc, item) => {
      const row = rows[item.id];
      if (!row) return acc;
      const add = (key: keyof CostRow) => {
        const n = num(row[key]);
        return n === null ? 0 : n * item.quantity;
      };
      return { estimated: acc.estimated + add("estimated"), approved: acc.approved + add("approved"), actual: acc.actual + add("actual") };
    },
    { estimated: 0, approved: 0, actual: 0 },
  );

  function set(id: string, key: keyof CostRow, value: string) {
    setRows((current) => ({ ...current, [id]: { ...(current[id] ?? { estimated: "", approved: "", actual: "" }), [key]: value } }));
  }

  return (
    <FormDialog
      trigger={trigger}
      title="Update costs"
      description="Unit costs in ₹. Request totals are calculated from quantity × unit cost. Leave a field empty if it isn't known yet."
      submitLabel="Save costs"
      size="xl"
      formError={formError}
      onOpen={() => {
        const snapshot = initial();
        setRows(snapshot);
        setBaseline(snapshot);
        setErrors({});
        setFormError(null);
      }}
      onSubmit={async () => {
        if (changes.length === 0) return true;
        const result = await run(() => updateRequestCostsAction({ request_id: requestId, items: changes }), "Costs updated.");
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          setFormError(result.error);
          return false;
        }
        return true;
      }}
    >
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const row = rows[item.id] ?? { estimated: "", approved: "", actual: "" };
          const index = payloadIndex.get(item.id) ?? -1;
          const field = (key: string) => errors[`items.${index}.${key}`];
          return (
            <li key={item.id} className="rounded-2xl border border-border-soft bg-surface-muted/50 p-4">
              <p className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold text-text">{item.material_name}</span>
                <span className="text-muted tabular-nums">{formatQuantity(item.quantity, item.unit)}</span>
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField label="Estimated / unit" error={field("estimated_unit_cost")}>
                  <Input type="number" inputMode="decimal" min={0} step="any" value={row.estimated} onChange={(e) => set(item.id, "estimated", e.target.value)} />
                </FormField>
                <FormField label="Approved / unit" error={field("approved_unit_cost")}>
                  <Input type="number" inputMode="decimal" min={0} step="any" value={row.approved} onChange={(e) => set(item.id, "approved", e.target.value)} />
                </FormField>
                <FormField label="Actual / unit" error={field("actual_unit_cost")}>
                  <Input type="number" inputMode="decimal" min={0} step="any" value={row.actual} onChange={(e) => set(item.id, "actual", e.target.value)} />
                </FormField>
              </div>
            </li>
          );
        })}
      </ul>
      <dl className="grid grid-cols-3 gap-3 rounded-2xl bg-soft p-4 text-sm">
        <div>
          <dt className="text-xs text-deep/80">Estimated</dt>
          <dd className="font-semibold tabular-nums text-deep">{formatINR(totals.estimated)}</dd>
        </div>
        <div>
          <dt className="text-xs text-deep/80">Approved</dt>
          <dd className="font-semibold tabular-nums text-deep">{formatINR(totals.approved)}</dd>
        </div>
        <div>
          <dt className="text-xs text-deep/80">Actual</dt>
          <dd className={cn("font-semibold tabular-nums", totals.actual > totals.estimated && totals.estimated > 0 ? "text-danger-text" : "text-deep")}>
            {formatINR(totals.actual)}
          </dd>
        </div>
      </dl>
    </FormDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Delivery                                                                   */
/* -------------------------------------------------------------------------- */

const round2 = (n: number) => Math.round(n * 100) / 100;

export function DeliveryDialog({ requestId, items, trigger }: { requestId: string; items: readonly WorkflowItem[]; trigger: ReactNode }) {
  const run = useActionRunner();
  const today = todayIST();
  const remainingOf = (item: WorkflowItem) => Math.max(0, round2(item.quantity - item.delivered_quantity));
  const initial = () => Object.fromEntries(items.map((item) => [item.id, remainingOf(item) > 0 ? String(remainingOf(item)) : ""]));
  // Field errors are keyed by position among the items still awaiting delivery (the payload order).
  const deliverable = items.filter((item) => remainingOf(item) > 0);
  const payloadIndex = new Map(deliverable.map((item, index) => [item.id, index]));
  const [date, setDate] = useState(today);
  const [quantities, setQuantities] = useState<Record<string, string>>(initial);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <FormDialog
      trigger={trigger}
      title="Record delivery"
      description="Enter what arrived on site. Partial deliveries are fine — the request stays open until everything is delivered."
      submitLabel="Record delivery"
      size="lg"
      formError={formError ?? errors.items?.[0] ?? null}
      onOpen={() => {
        setDate(todayIST());
        setQuantities(initial());
        setNotes("");
        setErrors({});
        setFormError(null);
      }}
      onSubmit={async () => {
        // Client-side guard so the admin sees the problem next to the item.
        const local: FieldErrors = {};
        deliverable.forEach((item, index) => {
          const n = num(quantities[item.id] ?? "");
          if (n !== null && (n < 0 || n > remainingOf(item))) {
            local[`items.${index}.delivered_quantity`] = [`At most ${formatQuantity(remainingOf(item), item.unit)} remaining.`];
          }
        });
        if (Object.keys(local).length > 0) {
          setErrors(local);
          setFormError("Please check the delivered quantities.");
          return false;
        }
        const result = await run(
          () =>
            recordDeliveryAction({
              request_id: requestId,
              delivery_date: date,
              notes,
              items: deliverable.map((item) => ({ item_id: item.id, delivered_quantity: quantities[item.id] ?? "" })),
            }),
          "Delivery recorded.",
        );
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          setFormError(result.error);
          return false;
        }
        return true;
      }}
    >
      <FormField label="Delivery date" required error={errors.delivery_date}>
        <Input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const remaining = remainingOf(item);
          const index = payloadIndex.get(item.id) ?? -1;
          return (
            <li key={item.id} className="grid grid-cols-1 items-end gap-3 rounded-2xl border border-border-soft bg-surface-muted/50 p-4 sm:grid-cols-[1fr_11rem]">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-text">{item.material_name}</p>
                <p className="text-muted tabular-nums">
                  {formatQuantity(item.delivered_quantity, item.unit)} of {formatQuantity(item.quantity, item.unit)} delivered
                  {remaining > 0 ? ` · ${formatQuantity(remaining, item.unit)} remaining` : ""}
                </p>
              </div>
              {remaining > 0 ? (
                <FormField label={`Delivered now (${item.unit})`} error={errors[`items.${index}.delivered_quantity`]}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={remaining}
                    step="any"
                    value={quantities[item.id] ?? ""}
                    onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: e.target.value }))}
                  />
                </FormField>
              ) : (
                <span className="text-sm font-medium text-success-text">Fully delivered</span>
              )}
            </li>
          );
        })}
      </ul>
      <FormField label="Notes" error={errors.notes} hint="Challan number, condition on arrival, shortages…">
        <Textarea rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>
    </FormDialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Assign admin (owner)                                                       */
/* -------------------------------------------------------------------------- */

export type AdminOption = { id: string; full_name: string; employee_id: string | null };

export function AssignAdminDialog({
  requestId,
  currentAdminId,
  admins,
  trigger,
}: {
  requestId: string;
  currentAdminId: string | null;
  admins: readonly AdminOption[];
  trigger: ReactNode;
}) {
  const run = useActionRunner();
  const [adminId, setAdminId] = useState(currentAdminId ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <FormDialog
      trigger={trigger}
      title="Assign admin"
      description="The admin is notified and becomes responsible for reviewing and procuring this request."
      submitLabel="Save assignment"
      size="sm"
      formError={formError}
      onOpen={() => {
        setAdminId(currentAdminId ?? "");
        setFormError(null);
      }}
      onSubmit={async () => {
        if ((adminId || null) === currentAdminId) return true;
        const result = await run(() => assignRequestAction({ request_id: requestId, admin_id: adminId || null }), "Assignment saved.");
        if (!result.ok) {
          setFormError(result.error);
          return false;
        }
        return true;
      }}
    >
      {admins.length === 0 ? (
        <p className="text-sm text-muted">There are no active admins yet. Add an admin from Users first.</p>
      ) : (
        <FormField label="Admin">
          <Select
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            placeholder="Unassigned"
            options={admins.map((a) => ({ value: a.id, label: a.employee_id ? `${a.full_name} (${a.employee_id})` : a.full_name }))}
          />
        </FormField>
      )}
    </FormDialog>
  );
}
