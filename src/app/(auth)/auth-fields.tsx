"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { inputClass } from "./auth-ui";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className">;

/** Password field with an accessible show/hide toggle. */
export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${inputClass} pr-12`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-0 right-1 my-auto inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-soft/60 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
      </button>
    </div>
  );
}

/** Submit button that shows a spinner while its form's action is pending. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={className}>
      {pending ? (
        <>
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
