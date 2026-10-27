"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deletePaymentAction } from "../actions";

export type PaymentDeleteButtonProps = { projectId: string; paymentId: string; label: string };

/** Delete a payment recorded by mistake (owner). The audit log keeps a record. */
export function PaymentDeleteButton({ projectId, paymentId, label }: PaymentDeleteButtonProps) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Delete payment ${label}`}>
          <Trash2 aria-hidden="true" />
        </Button>
      }
      title="Delete this payment?"
      description={`${label} will be removed from the totals and from the client's payment link.`}
      confirmLabel="Delete payment"
      destructive
      onConfirm={async () => {
        const result = await deletePaymentAction(projectId, paymentId);
        if (!result.ok) return { ok: false, error: result.error };
        toast.success(result.message ?? "Payment deleted.");
        router.refresh();
        return { ok: true };
      }}
    />
  );
}
