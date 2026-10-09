"use client";

import { Eye, EyeOff, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/action-result";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants";
import { changePasswordAction, signOutEverywhereAction, updateOwnProfileAction } from "./actions";

const NETWORK = "We couldn't reach the server. Check your connection and try again.";

export function ProfileDetailsForm({
  defaults,
  email,
  roleLabel,
  employeeId,
}: {
  defaults: { full_name: string; phone: string };
  email: string;
  roleLabel: string;
  employeeId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const res = await updateOwnProfileAction(formData);
        if (!res.ok) {
          setFieldErrors(res.fieldErrors ?? {});
          toast.error(res.error);
          return;
        }
        setFieldErrors({});
        toast.success(res.message ?? "Saved.");
        router.refresh();
      } catch {
        toast.error(NETWORK);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField label="Full name" name="full_name" required error={fieldErrors.full_name}>
          <Input defaultValue={defaults.full_name} maxLength={120} autoComplete="name" />
        </FormField>
        <FormField label="Phone" name="phone" error={fieldErrors.phone}>
          <Input type="tel" inputMode="tel" defaultValue={defaults.phone} maxLength={20} autoComplete="tel" />
        </FormField>
        <FormField label="Email" hint="Ask the owner to change your sign-in email.">
          <Input value={email} readOnly />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Role">
            <Input value={roleLabel} readOnly />
          </FormField>
          <FormField label="Employee ID">
            <Input value={employeeId ?? "—"} readOnly />
          </FormField>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending} loadingText="Saving…" className="w-full sm:w-auto">
          Save details
        </Button>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await changePasswordAction(formData);
        if (!res.ok) {
          setFieldErrors(res.fieldErrors ?? {});
          setFormError(res.fieldErrors ? null : res.error);
          toast.error(res.error);
          return;
        }
        setFieldErrors({});
        formRef.current?.reset();
        toast.success(res.message ?? "Password changed.");
      } catch {
        setFormError(NETWORK);
        toast.error(NETWORK);
      }
    });
  }

  const type = show ? "text" : "password";
  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {formError ? (
        <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text">
          {formError}
        </p>
      ) : null}
      <FormField label="Current password" name="currentPassword" required error={fieldErrors.currentPassword}>
        <Input type={type} autoComplete="current-password" maxLength={200} />
      </FormField>
      <FormField
        label="New password"
        name="password"
        required
        error={fieldErrors.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easy to remember and hard to guess.`}
      >
        <Input type={type} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} maxLength={72} />
      </FormField>
      <FormField label="Confirm new password" name="confirmPassword" required error={fieldErrors.confirmPassword}>
        <Input type={type} autoComplete="new-password" maxLength={72} />
      </FormField>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" onClick={() => setShow((v) => !v)} aria-pressed={show} className="w-fit">
          {show ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          {show ? "Hide passwords" : "Show passwords"}
        </Button>
        <Button type="submit" loading={pending} loadingText="Updating…" className="w-full sm:w-auto">
          Change password
        </Button>
      </div>
    </form>
  );
}

export function SignOutEverywhereButton() {
  async function confirm() {
    try {
      const res = await signOutEverywhereAction();
      if (!res.ok) return res;
      toast.success(res.message ?? "Signed out.");
      window.location.assign(res.data.redirectTo);
      return res;
    } catch {
      return { ok: false, error: NETWORK };
    }
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="w-full sm:w-fit">
          <LogOut aria-hidden="true" />
          Sign out of all devices
        </Button>
      }
      destructive
      title="Sign out everywhere?"
      description="This ends your sessions on every phone, tablet and computer — including this one. You'll need your password to sign in again."
      confirmLabel="Sign out everywhere"
      onConfirm={confirm}
    />
  );
}
