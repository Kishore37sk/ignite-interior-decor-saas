import { z } from "zod";
import { todayIST } from "@/lib/dates";
import { dateOnly, emptyToUndefined, money, optionalText, paymentModeSchema, uuid } from "@/lib/validation/common";

/** Record or edit one client payment (owner). `payment_id` present = edit. */
export const paymentFormSchema = z.object({
  project_id: uuid,
  payment_id: z.preprocess(emptyToUndefined, uuid.optional()),
  amount: money.refine((n) => n > 0, "Amount must be more than ₹0."),
  paid_on: dateOnly.refine((d) => d <= todayIST(), "Payment date can't be in the future."),
  mode: paymentModeSchema,
  reference: optionalText(120, "Reference"),
  notes: optionalText(1000, "Notes"),
});

export type PaymentFormValues = z.output<typeof paymentFormSchema>;
