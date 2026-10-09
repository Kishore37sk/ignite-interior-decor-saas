"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { FieldErrors } from "@/lib/action-result";
import { todayIST } from "@/lib/dates";
import { createUserAction, type CreateUserResult } from "../actions";
import type { StaffRole } from "../schemas";
import { SetupLinkPanel } from "./setup-link-panel";

export type AddUserDialogProps = {
  suggestions: Record<StaffRole, string>;
  defaultRole?: StaffRole;
  /** Lock the role (e.g. on /site-managers). */
  lockRole?: boolean;
  label?: string;
};

const ROLE_OPTIONS = [
  { value: "site_manager", label: "Site Manager" },
  { value: "admin", label: "Admin" },
] as const;

/** Owner "+ Add User" dialog: creates the auth user and sends a password setup link. */
export function AddUserDialog({ suggestions, defaultRole = "site_manager", lockRole = false, label = "Add User" }: AddUserDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<StaffRole>(defaultRole);
  const [employeeId, setEmployeeId] = useState(suggestions[defaultRole]);
  const [employeeIdEdited, setEmployeeIdEdited] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateUserResult | null>(null);

  function reset() {
    setRole(defaultRole);
    setEmployeeId(suggestions[defaultRole]);
    setEmployeeIdEdited(false);
    setFieldErrors({});
    setFormError(null);
    setResult(null);
  }

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) reset();
  }

  function onRoleChange(next: StaffRole) {
    setRole(next);
    if (!employeeIdEdited) setEmployeeId(suggestions[next]);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("role", role);
    setFormError(null);
    startTransition(async () => {
      try {
        const res = await createUserAction(formData);
        if (!res.ok) {
          setFieldErrors(res.fieldErrors ?? {});
          setFormError(res.error);
          toast.error(res.error);
          return;
        }
        setFieldErrors({});
        setResult(res.data);
        toast.success(res.message ?? "User created.");
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        size="md"
        hideClose={pending}
        onEscapeKeyDown={(e) => pending && e.preventDefault()}
        onInteractOutside={(e) => (pending || result) && e.preventDefault()}
      >
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>{result.fullName} was added</DialogTitle>
              <DialogDescription>
                They don&apos;t have a password yet — they choose their own using the setup link.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              {result.delivery === "email" ? (
                <SetupLinkPanel kind="email" email={result.email} />
              ) : result.delivery === "link" ? (
                <SetupLinkPanel kind="link" email={result.email} link={result.link} emailError={result.emailError} />
              ) : (
                <SetupLinkPanel
                  kind="none"
                  email={result.email}
                  message={`${result.emailError} Use “Send password link” from the user's actions to try again.`}
                />
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Add another
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle>{lockRole ? label.replace(/^\+\s*/, "") : "Add user"}</DialogTitle>
              <DialogDescription>
                Creates the login and sends a secure link so they can set their own password. You never see or choose
                their password.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              {formError && Object.keys(fieldErrors).length === 0 ? (
                <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text">
                  {formError}
                </p>
              ) : null}
              <FormField label="Full name" name="full_name" required error={err("full_name")}>
                <Input autoComplete="off" maxLength={120} placeholder="e.g. Arjun Rao" />
              </FormField>
              <FormField label="Email" name="email" required error={err("email")} hint="They sign in with this email.">
                <Input type="email" inputMode="email" autoComplete="off" maxLength={254} />
              </FormField>
              <FormField label="Phone" name="phone" error={err("phone")}>
                <Input type="tel" inputMode="tel" maxLength={20} placeholder="+91 98450 12345" />
              </FormField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Role" required error={err("role")}>
                  <Select
                    value={role}
                    disabled={lockRole}
                    onChange={(event) => onRoleChange(event.target.value as StaffRole)}
                    options={ROLE_OPTIONS}
                  />
                </FormField>
                <FormField
                  label="Employee ID"
                  name="employee_id"
                  error={err("employee_id")}
                  hint={`Suggested next ID: ${suggestions[role]}`}
                >
                  <Input
                    value={employeeId}
                    maxLength={20}
                    autoComplete="off"
                    onChange={(event) => {
                      setEmployeeId(event.target.value);
                      setEmployeeIdEdited(true);
                    }}
                  />
                </FormField>
              </div>
              <FormField label="Joining date" name="joining_date" error={err("joining_date")}>
                <Input type="date" defaultValue={todayIST()} />
              </FormField>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending} loadingText="Creating…">
                Create user
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
