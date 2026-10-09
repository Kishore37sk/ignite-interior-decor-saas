import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ERROR_MESSAGE,
  friendlyMessage,
  isRpcError,
  parseRpcError,
  toFriendlyError,
} from "./errors";

describe("parseRpcError", () => {
  it("extracts code and human text", () => {
    expect(parseRpcError({ message: "VALIDATION: Required date cannot be in the past" })).toEqual({
      code: "VALIDATION",
      detail: "Required date cannot be in the past",
    });
    expect(parseRpcError("NOT_FOUND")).toEqual({ code: "NOT_FOUND", detail: null });
    expect(parseRpcError({ message: "duplicate key value" })).toBeNull();
    expect(parseRpcError(null)).toBeNull();
  });

  it("detects specific codes", () => {
    const err = { code: "P0001", message: "DUPLICATE_REQUEST: Cement was requested 2 days ago (MR-1004)" };
    expect(isRpcError(err, "DUPLICATE_REQUEST")).toBe(true);
    expect(isRpcError(err, "VALIDATION")).toBe(false);
  });
});

describe("friendlyMessage", () => {
  it("shows the safe human text for validation-type RPC errors", () => {
    expect(friendlyMessage({ code: "P0001", message: "VALIDATION: progress must be between 0 and 100" })).toBe(
      "Progress must be between 0 and 100.",
    );
    expect(friendlyMessage({ code: "P0001", message: "PROJECT_CLOSED: Project P-1001 is completed." })).toBe(
      "Project P-1001 is completed.",
    );
  });

  it("uses generic copy for authorization RPC errors", () => {
    expect(friendlyMessage({ code: "P0001", message: "NOT_AUTHORIZED: caller 1234 lacks role" })).toBe(
      "You don't have permission to do that.",
    );
    expect(friendlyMessage({ message: "INACTIVE_USER: x" })).toMatch(/inactive/i);
    expect(friendlyMessage({ message: "INVALID_TRANSITION" })).toMatch(/status change/i);
  });

  it("maps Postgres and PostgREST codes", () => {
    expect(friendlyMessage({ code: "23505", message: 'duplicate key value violates unique constraint "clients_email_key"' })).toBe(
      "A record with these details already exists.",
    );
    expect(friendlyMessage({ code: "23503", message: "fk" })).toMatch(/linked to other data/);
    expect(friendlyMessage({ code: "23514", message: "check" })).toMatch(/allowed range/);
    expect(friendlyMessage({ code: "42501", message: "new row violates row-level security policy" })).toBe(
      "You don't have permission to do that.",
    );
    expect(friendlyMessage({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" })).toMatch(
      /couldn't find/,
    );
  });

  it("maps Supabase auth errors", () => {
    expect(friendlyMessage({ name: "AuthApiError", code: "invalid_credentials", status: 400, message: "Invalid login credentials" })).toBe(
      "Incorrect email or password.",
    );
    expect(friendlyMessage({ code: "user_banned", status: 400, message: "User is banned" })).toMatch(/deactivated/);
    expect(friendlyMessage({ message: "Invalid login credentials" })).toBe("Incorrect email or password.");
    expect(friendlyMessage({ status: 429, message: "rate limited" })).toMatch(/Too many attempts/);
  });

  it("maps network failures", () => {
    expect(friendlyMessage(new TypeError("fetch failed"))).toMatch(/couldn't reach the server/);
  });

  it("never leaks unknown raw messages", () => {
    expect(friendlyMessage(new Error('relation "secret_table" does not exist'))).toBe(DEFAULT_ERROR_MESSAGE);
    expect(friendlyMessage({ code: "XX000", message: "internal" }, "Unable to update project.")).toBe(
      "Unable to update project.",
    );
    expect(friendlyMessage(undefined)).toBe(DEFAULT_ERROR_MESSAGE);
    expect(friendlyMessage(42)).toBe(DEFAULT_ERROR_MESSAGE);
  });

  it("does not echo overly long RPC detail text", () => {
    expect(friendlyMessage({ message: `VALIDATION: ${"x".repeat(300)}` })).toBe(
      "Some of the details are invalid. Please check and try again.",
    );
  });
});

describe("toFriendlyError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs technical details server-side and returns friendly text", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const message = toFriendlyError({ code: "23505", message: "dup", details: "Key (email)=(a@b.c)" }, undefined, "clients.create");
    expect(message).toBe("A record with these details already exists.");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain("clients.create");
  });
});
