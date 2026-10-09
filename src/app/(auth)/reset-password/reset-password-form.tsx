"use client";

import { useActionState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants";
import { PasswordInput, SubmitButton } from "../auth-fields";
import { FieldError, FormAlert, labelClass, submitClass } from "../auth-ui";
import { updatePassword, type ResetPasswordState } from "./actions";

export function ResetPasswordForm({ submitLabel }: { submitLabel: string }) {
  const [state, formAction] = useActionState<ResetPasswordState, FormData>(updatePassword, {});
  const passwordError = state.fieldErrors?.password?.[0];
  const confirmError = state.fieldErrors?.confirmPassword?.[0];
  const hasFieldErrors = Boolean(passwordError || confirmError);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && !hasFieldErrors ? <FormAlert>{state.error}</FormAlert> : null}

      <div>
        <label htmlFor="password" className={labelClass}>
          New password
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-error" : "password-hint"}
        />
        {passwordError ? (
          <FieldError id="password-error" message={passwordError} />
        ) : (
          <p id="password-hint" className="mt-1.5 text-sm text-muted">
            At least {PASSWORD_MIN_LENGTH} characters. A short phrase is easier to remember.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword" className={labelClass}>
          Confirm new password
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          aria-invalid={confirmError ? true : undefined}
          aria-describedby={confirmError ? "confirm-error" : undefined}
        />
        <FieldError id="confirm-error" message={confirmError} />
      </div>

      <SubmitButton pendingLabel="Saving…" className={submitClass}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
