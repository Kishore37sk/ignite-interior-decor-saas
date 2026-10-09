"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/action-result";
import { updateUserAction } from "../actions";
import type { ManagedUser } from "./types";

export function EditUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: ManagedUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function change(next: boolean) {
    if (pending) return;
    if (!next) {
      setFieldErrors({});
      setFormError(null);
    }
    onOpenChange(next);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await updateUserAction(user.id, formData);
        if (!res.ok) {
          setFieldErrors(res.fieldErrors ?? {});
          setFormError(res.error);
          toast.error(res.error);
          return;
        }
        toast.success(res.message ?? "Saved.");
        setFieldErrors({});
        onOpenChange(false);
        router.refresh();
      } catch {
        const message = "We couldn't reach the server. Check your connection and try again.";
        setFormError(message);
        toast.error(message);
      }
    });
  }

  const err = (field: string) => fieldErrors[field];

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent size="md" hideClose={pending} onInteractOutside={(e) => pending && e.preventDefault()}>
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Edit {user.full_name}</DialogTitle>
            <DialogDescription>
              Email and role can&apos;t be changed here. To give someone a different role, create a new account.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            {formError && Object.keys(fieldErrors).length === 0 ? (
              <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text">
                {formError}
              </p>
            ) : null}
            <FormField label="Full name" name="full_name" required error={err("full_name")}>
              <Input defaultValue={user.full_name} maxLength={120} autoComplete="off" />
            </FormField>
            <FormField label="Email" hint="Sign-in email (read-only).">
              <Input value={user.email} readOnly />
            </FormField>
            <FormField label="Phone" name="phone" error={err("phone")}>
              <Input type="tel" inputMode="tel" defaultValue={user.phone ?? ""} maxLength={20} />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Employee ID" name="employee_id" error={err("employee_id")}>
                <Input defaultValue={user.employee_id ?? ""} maxLength={20} autoComplete="off" />
              </FormField>
              <FormField label="Joining date" name="joining_date" error={err("joining_date")}>
                <Input type="date" defaultValue={user.joining_date ?? ""} />
              </FormField>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => change(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} loadingText="Saving…">
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
