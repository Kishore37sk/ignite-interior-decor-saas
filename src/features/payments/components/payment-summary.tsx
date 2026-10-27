import { Banknote, CreditCard, FileText, Landmark, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import { CurrencyText } from "@/components/shared/currency-text";
import { ProgressBar } from "@/components/shared/progress-bar";
import { PAYMENT_MODE_LABELS } from "@/lib/constants";
import { formatPercent, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PaymentMode } from "@/types/database";
import type { PaymentTotals } from "../statement";

export const PAYMENT_MODE_ICONS: Record<PaymentMode, LucideIcon> = {
  upi: Smartphone,
  cash: Banknote,
  card: CreditCard,
  bank_transfer: Landmark,
  cheque: FileText,
  other: Wallet,
};

export type ModeTotal = { mode: PaymentMode; amount: number; count: number };

/** Sum payments per mode, largest first. */
export function totalsByMode(payments: ReadonlyArray<{ mode: PaymentMode; amount: number }>): ModeTotal[] {
  const map = new Map<PaymentMode, ModeTotal>();
  for (const p of payments) {
    const row = map.get(p.mode) ?? { mode: p.mode, amount: 0, count: 0 };
    row.amount += Number(p.amount);
    row.count += 1;
    map.set(p.mode, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** Project value / received / balance tiles with a collected bar. */
export function PaymentTotalsGrid({ totals, paymentCount }: { totals: PaymentTotals; paymentCount: number }) {
  const excess = totals.balance < 0;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Total project value" value={totals.projectCost} sub={totals.projectCost > 0 ? null : "Not set yet"} />
        <Tile
          label="Received"
          value={totals.received}
          sub={paymentCount > 0 ? pluralize(paymentCount, "payment") : "No payments yet"}
          tone="success"
        />
        <Tile
          label={excess ? "Paid in excess" : "Balance to pay"}
          value={Math.abs(totals.balance)}
          sub={totals.projectCost > 0 ? (totals.balance === 0 ? "Fully paid" : null) : null}
          tone={excess ? "warning" : totals.balance > 0 ? "danger" : "success"}
        />
      </dl>
      {totals.projectCost > 0 ? (
        <div className="flex flex-col gap-1.5">
          <ProgressBar value={totals.percentPaid} label="Share of project value received" tone="primary" size="md" />
          <p className="text-xs text-muted">{formatPercent(totals.percentPaid, 0)} of the project value received</p>
        </div>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: number;
  sub?: string | null;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border-soft bg-surface p-4">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd
        className={cn(
          "text-2xl font-semibold tracking-tight",
          tone === "success" && "text-success-text",
          tone === "danger" && "text-danger-text",
          tone === "warning" && "text-warning-text",
          tone === "default" && "text-text",
        )}
      >
        <CurrencyText value={value} />
      </dd>
      {sub ? <dd className="text-xs text-muted">{sub}</dd> : null}
    </div>
  );
}

/** Received amount split by mode (cash, card, UPI, …). */
export function PaymentModeBreakdown({ rows, received }: { rows: readonly ModeTotal[]; received: number }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No payments recorded yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const Icon = PAYMENT_MODE_ICONS[row.mode];
        const share = received > 0 ? (row.amount / received) * 100 : 0;
        return (
          <li key={row.mode} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-primary-strong">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="font-medium text-text">{PAYMENT_MODE_LABELS[row.mode]}</span>
                <span className="text-xs text-muted">{pluralize(row.count, "payment")}</span>
              </span>
              <span className="font-semibold text-text">
                <CurrencyText value={row.amount} />
              </span>
            </div>
            <ProgressBar value={share} label={`${PAYMENT_MODE_LABELS[row.mode]} share of received`} tone="deep" size="sm" />
          </li>
        );
      })}
    </ul>
  );
}
