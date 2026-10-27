import { getSiteUrl } from "@/lib/env";

/** Share tokens: URL-safe, 32–128 characters (matches the 0009 check constraint). */
export const STATEMENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function statementPath(token: string): string {
  return `/statement/${token}`;
}

export function statementUrl(token: string): string {
  return `${getSiteUrl()}${statementPath(token)}`;
}

export type PaymentTotals = {
  projectCost: number;
  received: number;
  /** Still to pay; negative when the client paid more than the project cost. */
  balance: number;
  /** 0–100, share of the project cost received (0 when no cost is set). */
  percentPaid: number;
};

export function paymentTotals(projectCost: number, received: number): PaymentTotals {
  const balance = Math.round((projectCost - received) * 100) / 100;
  const percentPaid = projectCost > 0 ? Math.min(100, (received / projectCost) * 100) : 0;
  return { projectCost, received, balance, percentPaid };
}
