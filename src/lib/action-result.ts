import type { z } from "zod";
import { toFriendlyError } from "@/lib/errors";

export type FieldErrors = Record<string, string[]>;

export type ActionSuccess<T> = { ok: true; data: T; message?: string };
export type ActionFailure = { ok: false; error: string; fieldErrors?: FieldErrors };

/** Result returned by every server action (ARCHITECTURE §8). */
export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure;

/** Successful result. `ok()` for void actions, `ok(data, "Saved.")` otherwise. */
export function ok(): ActionSuccess<undefined>;
export function ok<T>(data: T, message?: string): ActionSuccess<T>;
export function ok<T>(data?: T, message?: string): ActionSuccess<T | undefined> {
  return message === undefined ? { ok: true, data } : { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: FieldErrors): ActionFailure {
  return fieldErrors && Object.keys(fieldErrors).length > 0
    ? { ok: false, error, fieldErrors }
    : { ok: false, error };
}

/** Field errors keyed by dotted path (`items.0.quantity`); form-level issues use `_form`. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
    const list = out[key] ?? [];
    if (!list.includes(issue.message)) list.push(issue.message);
    out[key] = list;
  }
  return out;
}

export function validationFailure(
  error: z.ZodError,
  message = "Please fix the highlighted fields.",
): ActionFailure {
  return fail(message, zodFieldErrors(error));
}

/** Map a caught error to a failed result (raw details are logged server-side only). */
export function failFromError(err: unknown, fallback: string, context = "action"): ActionFailure {
  return { ok: false, error: toFriendlyError(err, fallback, context) };
}

/** First error for a field — handy in forms. */
export function firstFieldError(
  result: ActionResult<unknown> | null | undefined,
  field: string,
): string | undefined {
  if (!result || result.ok) return undefined;
  return result.fieldErrors?.[field]?.[0];
}
