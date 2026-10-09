"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "../auth-fields";
import { FieldError, FormAlert, inputClass, labelClass, submitClass } from "../auth-ui";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const backLinkClass =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold text-primary-strong hover:text-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ForgotPasswordState, FormData>(requestPasswordReset, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <div className="space-y-6">
        <FormAlert tone="success">
          If an account exists for <strong className="break-all font-semibold">{state.email}</strong>, we&apos;ve
          sent a link to reset your password. The link is valid for a limited time — check your spam folder if
          you don&apos;t see it.
        </FormAlert>
        <Link href="/login" className={backLinkClass}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </div>
    );
  }

  const emailError = state.fieldErrors?.email?.[0];

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && !emailError ? <FormAlert>{state.error}</FormAlert> : null}
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="you@igniteinteriordecor.com"
          defaultValue={state.email}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
          className={inputClass}
        />
        <FieldError id="email-error" message={emailError} />
      </div>
      <SubmitButton pendingLabel="Sending link…" className={submitClass}>
        Send reset link
      </SubmitButton>
      <div className="text-center">
        <Link href="/login" className={backLinkClass}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
