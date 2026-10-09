import { CircleAlert } from "lucide-react";
import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

/** Props FormField wires onto its control. */
export type FormControlProps = {
  id: string;
  name?: string;
  required?: boolean;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

export type FormFieldProps = {
  label: ReactNode;
  /** Control id; generated when omitted. */
  id?: string;
  /** Forwarded to the control as `name` (handy for server-action forms). */
  name?: string;
  required?: boolean;
  /** Error message(s), e.g. `fieldErrors.title` from an ActionResult. */
  error?: string | readonly string[] | null;
  hint?: ReactNode;
  /** Visually hide the label (still announced). */
  hideLabel?: boolean;
  className?: string;
  /** A single control element, or a render function receiving the wiring props. */
  children: ReactElement<Partial<FormControlProps>> | ((props: FormControlProps) => ReactNode);
};

function firstError(error: FormFieldProps["error"]): string | null {
  if (!error) return null;
  if (typeof error === "string") return error || null;
  return error.find((message) => message.length > 0) ?? null;
}

/**
 * Label + control + hint + error with correct `id`/`htmlFor`, `aria-describedby`,
 * `aria-invalid` and `required` wiring.
 */
export function FormField({
  label,
  id,
  name,
  required = false,
  error,
  hint,
  hideLabel = false,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? `field-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const message = firstError(error);

  const describedBy = [hint ? hintId : null, message ? errorId : null].filter(Boolean).join(" ") || undefined;

  const controlProps: FormControlProps = {
    id: controlId,
    ...(name ? { name } : {}),
    ...(required ? { required: true } : {}),
    ...(message ? { "aria-invalid": true } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
  };

  let control: ReactNode;
  if (typeof children === "function") {
    control = children(controlProps);
  } else if (isValidElement(children)) {
    const existing = children.props["aria-describedby"];
    control = cloneElement(children, {
      ...controlProps,
      ...(existing ? { "aria-describedby": [existing, describedBy].filter(Boolean).join(" ") } : {}),
    });
  } else {
    control = children;
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={controlId} required={required} className={hideLabel ? "sr-only" : undefined}>
        {label}
      </Label>
      {control}
      {hint && !message ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {hint && message ? (
        <p id={hintId} className="sr-only">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-xs font-medium text-danger-text">
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}
