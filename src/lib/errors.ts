/**
 * Error → friendly-message mapping. Raw database / auth errors are never shown to users;
 * technical details are logged server-side only.
 */

export const RPC_ERROR_CODES = [
  "NOT_AUTHORIZED",
  "NOT_FOUND",
  "INVALID_TRANSITION",
  "VALIDATION",
  "DUPLICATE_REQUEST",
  "PROJECT_CLOSED",
  "INACTIVE_USER",
] as const;
export type RpcErrorCode = (typeof RPC_ERROR_CODES)[number];

export const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";
export const NETWORK_ERROR_MESSAGE =
  "We couldn't reach the server. Check your connection and try again.";

const RPC_MESSAGES: Record<RpcErrorCode, string> = {
  NOT_AUTHORIZED: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find that record. It may have been removed.",
  INVALID_TRANSITION: "That status change isn't allowed from the current status.",
  VALIDATION: "Some of the details are invalid. Please check and try again.",
  DUPLICATE_REQUEST:
    "A similar material request for this project is already open. Review it before creating another.",
  PROJECT_CLOSED: "This project is closed, so it can no longer be changed.",
  INACTIVE_USER: "This account is inactive. Contact the owner for access.",
};

/** Codes whose human text (written in our own SQL) is safe and more specific to show. */
const RPC_CODES_WITH_SAFE_DETAIL: ReadonlySet<RpcErrorCode> = new Set<RpcErrorCode>([
  "VALIDATION",
  "INVALID_TRANSITION",
  "DUPLICATE_REQUEST",
  "PROJECT_CLOSED",
]);

const POSTGRES_MESSAGES: Record<string, string> = {
  "23505": "A record with these details already exists.",
  "23503": "This record is linked to other data and can't be changed that way.",
  "23514": "Some values are outside the allowed range. Please check and try again.",
  "23502": "A required field is missing.",
  "22P02": "Some values are in an invalid format.",
  "22007": "Please enter a valid date.",
  "22008": "Please enter a valid date.",
  "22003": "A number is too large.",
  "22001": "Some text is too long.",
  "42501": "You don't have permission to do that.",
  "40001": "Another change happened at the same time. Please try again.",
  "40P01": "Another change happened at the same time. Please try again.",
  "57014": "The request took too long. Please try again.",
  PGRST116: "We couldn't find that record, or you don't have access to it.",
  PGRST301: "Your session has expired. Please sign in again.",
  PGRST303: "Your session has expired. Please sign in again.",
};

const SESSION_EXPIRED = "Your session has expired. Please sign in again.";
const TOO_MANY = "Too many attempts. Please wait a minute and try again.";
const INVALID_CREDENTIALS = "Incorrect email or password.";
const DEACTIVATED = "Your account has been deactivated. Contact the owner for access.";

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: INVALID_CREDENTIALS,
  user_not_found: INVALID_CREDENTIALS,
  user_banned: DEACTIVATED,
  email_not_confirmed: "Please confirm your email address before signing in.",
  over_request_rate_limit: TOO_MANY,
  too_many_requests: TOO_MANY,
  over_email_send_rate_limit:
    "Too many emails were requested. Please wait a few minutes and try again.",
  same_password: "Your new password must be different from the current one.",
  weak_password:
    "That password is too weak. Use at least 10 characters with a mix of letters and numbers.",
  session_not_found: SESSION_EXPIRED,
  session_expired: SESSION_EXPIRED,
  refresh_token_not_found: SESSION_EXPIRED,
  refresh_token_already_used: SESSION_EXPIRED,
  otp_expired: "This link has expired or was already used. Please request a new one.",
  flow_state_expired: "This link has expired. Please request a new one.",
  flow_state_not_found: "This link is invalid or was already used. Please request a new one.",
  bad_code_verifier: "Please open this link in the same browser you requested it from.",
  email_address_invalid: "Please enter a valid email address.",
  email_exists: "An account with this email already exists.",
  user_already_exists: "An account with this email already exists.",
  signup_disabled: "New sign-ups are disabled. Contact the owner for an account.",
  reauthentication_needed: "Please sign in again to continue.",
};

type ErrorLike = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
  name?: unknown;
};

function asErrorLike(err: unknown): ErrorLike | null {
  return typeof err === "object" && err !== null ? (err as ErrorLike) : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export type ParsedRpcError = { code: RpcErrorCode; detail: string | null };

const RPC_PATTERN = new RegExp(`^\\s*(${RPC_ERROR_CODES.join("|")})\\b\\s*:?\\s*([\\s\\S]*)$`);

/** Extract `CODE: human text` raised by our RPC functions, if present. */
export function parseRpcError(err: unknown): ParsedRpcError | null {
  const message = typeof err === "string" ? err : str(asErrorLike(err)?.message);
  if (!message) return null;
  const match = RPC_PATTERN.exec(message);
  if (!match) return null;
  const detail = match[2]?.trim() ?? "";
  return { code: match[1] as RpcErrorCode, detail: detail.length > 0 ? detail : null };
}

/** True when `err` is an RPC error with the given code (e.g. to offer "create anyway"). */
export function isRpcError(err: unknown, code: RpcErrorCode): boolean {
  return parseRpcError(err)?.code === code;
}

function cleanDetail(detail: string): string | null {
  const trimmed = detail.replace(/\s+/g, " ").trim();
  if (trimmed.length === 0 || trimmed.length > 240) return null;
  const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

const NETWORK_PATTERN =
  /fetch failed|failed to fetch|networkerror|network request failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i;

/** Map any thrown value / Supabase error to a sentence that is safe to show to users. */
export function friendlyMessage(err: unknown, fallback: string = DEFAULT_ERROR_MESSAGE): string {
  if (err === null || err === undefined) return fallback;

  const rpc = parseRpcError(err);
  if (rpc) {
    if (rpc.detail && RPC_CODES_WITH_SAFE_DETAIL.has(rpc.code)) {
      return cleanDetail(rpc.detail) ?? RPC_MESSAGES[rpc.code];
    }
    return RPC_MESSAGES[rpc.code];
  }

  const e = asErrorLike(err);
  if (!e) return fallback;
  const code = str(e.code);
  const message = str(e.message);

  if (code) {
    const known = AUTH_MESSAGES[code] ?? POSTGRES_MESSAGES[code];
    if (known) return known;
  }

  if (message) {
    if (/invalid login credentials/i.test(message)) return INVALID_CREDENTIALS;
    if (/user is banned/i.test(message)) return DEACTIVATED;
    if (/email not confirmed/i.test(message)) return AUTH_MESSAGES.email_not_confirmed ?? fallback;
    if (/row-level security|permission denied/i.test(message)) return RPC_MESSAGES.NOT_AUTHORIZED;
    if (/jwt expired/i.test(message)) return SESSION_EXPIRED;
  }
  if (e.status === 429) return TOO_MANY;
  if (str(e.name) === "AuthRetryableFetchError" || (message && NETWORK_PATTERN.test(message))) {
    return NETWORK_ERROR_MESSAGE;
  }
  return fallback;
}

/** Log technical details on the server only (never in the browser console). */
export function logServerError(context: string, err: unknown): void {
  if (typeof window !== "undefined") return;
  const e = asErrorLike(err);
  console.error(`[ignite] ${context}`, {
    message: e ? e.message : String(err),
    code: e?.code,
    details: e?.details,
    hint: e?.hint,
    status: e?.status,
    name: e?.name,
  });
}

/**
 * Friendly message for display, with server-side logging of the raw error.
 * @param context short label for logs, e.g. "clients.create".
 */
export function toFriendlyError(
  err: unknown,
  fallback: string = DEFAULT_ERROR_MESSAGE,
  context = "action",
): string {
  logServerError(context, err);
  return friendlyMessage(err, fallback);
}
