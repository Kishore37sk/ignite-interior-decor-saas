"use client";

import Link from "next/link";
import { useActionState } from "react";
import { PasswordInput, SubmitButton } from "../auth-fields";
import { FieldError, FormAlert, inputClass, labelClass, submitClass } from "../auth-ui";
import { signIn, type LoginState } from "./actions";

type LoginFormProps = {
  next?: string;
  /** Message from the URL (e.g. signed out because the account was deactivated). */
  notice?: string;
};

export function LoginForm({ next, notice }: LoginFormProps) {
  const [state, formAction] = useActionState<LoginState, FormData>(signIn, {});
  const emailError = state.fieldErrors?.email?.[0];
  const passwordError = state.fieldErrors?.password?.[0];
  const message = state.error ?? notice;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {message ? <FormAlert id="login-error">{message}</FormAlert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="you@igniteinteriordecor.com"
          defaultValue={state.email}
          key={state.email ?? "email"}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : message ? "login-error" : undefined}
          className={inputClass}
        />
        <FieldError id="email-error" message={emailError} />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor="password" className="text-sm font-semibold text-text">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="rounded text-sm font-semibold text-primary-strong hover:text-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="Enter your password"
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-error" : undefined}
        />
        <FieldError id="password-error" message={passwordError} />
      </div>

      <SubmitButton pendingLabel="Signing in…" className={submitClass}>
        Sign In
      </SubmitButton>

      <p className="text-center text-sm text-muted">
        Accounts are created by the owner. Need access? Contact your administrator.
      </p>
    </form>
  );
}
