/**
 * Reusable zod building blocks shared by client forms and server actions.
 *
 * Inputs may arrive from `FormData` (strings) or JSON (numbers/null), so the
 * optional/numeric helpers normalise `""`, `null` and `undefined` consistently:
 * optional fields resolve to `null` (ready for a DB column), required ones fail
 * with a clear message.
 */
import { z } from "zod";
import {
  APP_ROLES,
  DOCUMENT_CATEGORIES,
  MATERIAL_REQUEST_STATUSES,
  MEMBER_ROLES,
  MILESTONE_STATUSES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PRIORITY_LEVELS,
  PROJECT_STATUSES,
  USER_STATUSES,
} from "@/lib/constants";
import { isDateOnly } from "@/lib/dates";

/* -------------------------------------------------------------------------- */
/* Normalisers                                                                */
/* -------------------------------------------------------------------------- */

/** `""`, whitespace, `null` → `undefined` (so `.optional()` kicks in). */
export function emptyToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

/** Strings like "4,20,000" or " 12.5 " → number; other values pass through for zod to judge. */
export function toNumberInput(value: unknown): unknown {
  const v = emptyToUndefined(value);
  if (typeof v !== "string") return v;
  const cleaned = v.replace(/[,\s₹]/g, "");
  return cleaned === "" ? undefined : Number(cleaned);
}

function nullable<T extends z.ZodType>(schema: T) {
  return z
    .preprocess(emptyToUndefined, schema.optional())
    .transform((v): z.output<T> | null => (v === undefined ? null : (v as z.output<T>)));
}

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

/** Required, trimmed text with a max length. */
export function requiredText(label: string, max = 200) {
  return z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);
}

/** Optional trimmed text; empty → `null`. */
export function optionalText(max = 2000, label = "This field") {
  return nullable(z.string().trim().max(max, `${label} must be ${max} characters or fewer.`));
}

/* -------------------------------------------------------------------------- */
/* Identity & contact                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Any 8-4-4-4-12 hex identifier (Postgres `uuid`). Intentionally not RFC-variant strict
 * so fixed/seeded ids are accepted.
 */
export const uuid = z
  .string({ error: "Invalid id." })
  .trim()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid id.")
  .transform((v) => v.toLowerCase());

export const optionalUuid = nullable(uuid);

/** Required email, trimmed and lower-cased. */
export const email = z
  .string({ error: "Email is required." })
  .trim()
  .min(1, "Email is required.")
  .max(254, "Email is too long.")
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const optionalEmail = nullable(email);

const PHONE_SEPARATORS = /[\s().-]/g;

/** Strip separators: "+91 98450 12345" → "+919845012345". */
export function normalizePhone(value: string): string {
  return value.trim().replace(PHONE_SEPARATORS, "");
}

/**
 * Indian / E.164 tolerant phone check (after removing spaces, dashes, dots, brackets):
 * - E.164: `+` then 8–15 digits (`+919845012345`, `+14155550123`)
 * - Indian mobile: 10 digits starting 6–9 (`9845012345`), optionally with `0` or `91` prefix
 * - Indian landline with STD code: `0` + 9–11 digits (`08012345678`)
 */
export function isValidPhone(value: string): boolean {
  const v = normalizePhone(value);
  return (
    /^\+[1-9]\d{7,14}$/.test(v) ||
    /^(?:0|91)?[6-9]\d{9}$/.test(v) ||
    /^0\d{9,11}$/.test(v)
  );
}

/** Required phone, normalised to its compact form. */
export const phone = z
  .string({ error: "Phone number is required." })
  .trim()
  .min(1, "Phone number is required.")
  .refine(isValidPhone, "Enter a valid phone number, e.g. +91 98450 12345.")
  .transform(normalizePhone);

export const optionalPhone = nullable(phone);

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

/** Required `YYYY-MM-DD` calendar date (validated without timezone conversion). */
export const dateOnly = z
  .string({ error: "Date is required." })
  .trim()
  .min(1, "Date is required.")
  .refine((v) => isDateOnly(v), "Enter a valid date.");

/** Optional `YYYY-MM-DD`; empty → `null`. */
export const optionalDate = nullable(dateOnly);

/* -------------------------------------------------------------------------- */
/* Numbers                                                                    */
/* -------------------------------------------------------------------------- */

/** Has at most `places` decimal places (guards numeric(p,2) columns). */
function maxDecimals(places: number) {
  return (n: number) => Math.abs(Math.round(n * 10 ** places) - n * 10 ** places) < 1e-6;
}

const MONEY_MAX = 999_999_999_999.99; // numeric(14,2)
const QUANTITY_MAX = 9_999_999_999.99; // numeric(12,2)

const moneyNumber = z
  .number({ error: "Enter a valid amount." })
  .finite("Enter a valid amount.")
  .min(0, "Amount cannot be negative.")
  .max(MONEY_MAX, "Amount is too large.")
  .refine(maxDecimals(2), "Use at most 2 decimal places.");

/** Rupee amount ≥ 0 (accepts "4,20,000" strings from forms). */
export const money = z.preprocess(toNumberInput, moneyNumber);
export const optionalMoney = z
  .preprocess(toNumberInput, moneyNumber.optional())
  .transform((v) => (v === undefined ? null : v));

const quantityNumber = z
  .number({ error: "Enter a valid quantity." })
  .finite("Enter a valid quantity.")
  .gt(0, "Quantity must be greater than 0.")
  .max(QUANTITY_MAX, "Quantity is too large.")
  .refine(maxDecimals(2), "Use at most 2 decimal places.");

/** Quantity > 0 with up to 2 decimals. */
export const quantity = z.preprocess(toNumberInput, quantityNumber);

const percentageNumber = z
  .number({ error: "Enter a percentage between 0 and 100." })
  .finite("Enter a percentage between 0 and 100.")
  .min(0, "Progress must be between 0 and 100.")
  .max(100, "Progress must be between 0 and 100.")
  .refine(maxDecimals(2), "Use at most 2 decimal places.");

/** Percentage 0–100 (progress). */
export const percentage = z.preprocess(toNumberInput, percentageNumber);

/** Checkbox / switch from FormData ("on", "true", "1") or JSON boolean. */
export const checkbox = z.preprocess(
  (v) => v === true || v === "on" || v === "true" || v === "1",
  z.boolean(),
);

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const appRoleSchema = z.enum(APP_ROLES, { error: "Choose a valid role." });
export const userStatusSchema = z.enum(USER_STATUSES, { error: "Choose a valid status." });
export const projectStatusSchema = z.enum(PROJECT_STATUSES, { error: "Choose a valid status." });
export const prioritySchema = z.enum(PRIORITY_LEVELS, { error: "Choose a valid priority." });
export const materialRequestStatusSchema = z.enum(MATERIAL_REQUEST_STATUSES, {
  error: "Choose a valid status.",
});
export const milestoneStatusSchema = z.enum(MILESTONE_STATUSES, { error: "Choose a valid status." });
export const memberRoleSchema = z.enum(MEMBER_ROLES, { error: "Choose a valid role." });
export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES, {
  error: "Choose a valid category.",
});

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

export const password = z
  .string({ error: "Password is required." })
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`);

/* -------------------------------------------------------------------------- */
/* FormData                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Plain object from FormData. Repeated keys become arrays; `File` entries are kept
 * only when non-empty. Keys starting with `$ACTION` (Next internals) are dropped.
 */
export function formDataToObject(formData: FormData): Record<string, FormDataEntryValue | FormDataEntryValue[]> {
  const out: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    if (typeof value !== "string" && value.size === 0) continue;
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else out[key] = [existing, value];
  }
  return out;
}
