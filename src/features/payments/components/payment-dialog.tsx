"use client";

import { Pencil, Plus } from "lucide-react";
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
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import type { PaymentMode } from "@/types/database";
import { savePaymentAction } from "../actions";

export type PaymentDialogProps = {
  projectId: string;
  /** Edit this payment; omit to record a new one. */
  payment?: {
    id: string;
    amount: number;
    paid_on: string;
    mode: PaymentMode;
    reference: string | null;
    notes: string | null;
  };
  /** Shown as a hint when recording a new payment. */
  balance?: number;
};

const REFERENCE_HINT: Partial<Record<PaymentMode, string>> = {
  upi: "UPI transaction ID",
  card: "Last 4 digits or approval code",
  bank_transfer: "UTR / transaction number",
  cheque: "Cheque number and bank",
};

/** Record or edit a client payment (owner). */
export function PaymentDialog({ projectId, payment, balance }: PaymentDialogProps) {
  const router = useRouter();
  const editing = Boolean(payment);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [mode, setMode] = useState<PaymentMode>(payment?.mode ?? "upi");
  const formId = `payment-form-${payment?.id ?? "new"}`;

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (next) {
      setErrors({});
      setFormError(null);
      setMode(payment?.mode ?? "upi");
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await savePaymentAction(formData).catch(() => ({
        ok: false as const,
        error: "We couldn't reach the server. Please try again.",
        fieldErrors: undefined,
      }));
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      toast.success(result.message ?? "Saved.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon-sm" aria-label="Edit payment">
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden="true" />
            Record payment
          </Button>
        )}
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit payment" : "Record payment"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Changes show up on the client's payment link straight away."
              : balance !== undefined && balance > 0
                ? `Balance due: ₹${balance.toLocaleString("en-IN")}.`
                : "Add an amount the client has paid."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id={formId} onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="project_id" value={projectId} />
            {payment ? <input type="hidden" name="payment_id" value={payment.id} /> : null}
            <FormField label="Amount (₹)" name="amount" required error={errors.amount}>
              <Input
                inputMode="decimal"
                defaultValue={payment ? String(payment.amount) : ""}
                leading={<span className="text-sm">₹</span>}
                placeholder="0"
                autoFocus
              />
            </FormField>
            <FormField label="Paid on" name="paid_on" required error={errors.paid_on}>
              <Input type="date" defaultValue={payment?.paid_on ?? todayIST()} max={todayIST()} />
            </FormField>
            <FormField label="Paid by" name="mode" required error={errors.mode}>
              <Select
                value={mode}
                onChange={(e) => setMode(e.target.value as PaymentMode)}
                options={PAYMENT_MODES.map((value) => ({ value, label: PAYMENT_MODE_LABELS[value] }))}
              />
            </FormField>
            <FormField
              label="Reference"
              name="reference"
              error={errors.reference}
              hint={REFERENCE_HINT[mode] ? `${REFERENCE_HINT[mode]}. The client sees this.` : "Optional. The client sees this."}
            >
              <Input defaultValue={payment?.reference ?? ""} maxLength={120} />
            </FormField>
            <FormField
              label="Internal notes"
              name="notes"
              error={errors.notes}
              hint="Only you and members with financial access see notes."
              className="sm:col-span-2"
            >
              <Textarea rows={2} defaultValue={payment?.notes ?? ""} maxLength={1000} />
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
            {editing ? "Save payment" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
