import { Link2Off, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { CurrencyText } from "@/components/shared/currency-text";
import { BRAND, PAYMENT_MODE_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/dates";
import { PAYMENT_MODE_ICONS, PaymentModeBreakdown, PaymentTotalsGrid } from "@/features/payments/components/payment-summary";
import { getPaymentStatement } from "@/features/payments/queries";
import { paymentTotals, STATEMENT_TOKEN_PATTERN } from "@/features/payments/statement";
import type { PaymentStatement } from "@/types/database";
import { PrintButton } from "./print-button";

// Always show the latest payments.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment statement",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type PageProps = { params: Promise<{ token: string }> };

async function loadStatement(token: string): Promise<PaymentStatement | null> {
  if (!STATEMENT_TOKEN_PATTERN.test(token)) return null;
  return getPaymentStatement(token);
}

/** Public, read-only client payment statement opened from a share link. */
export default async function PaymentStatementPage({ params }: PageProps) {
  const { token } = await params;
  const statement = await loadStatement(token);

  if (!statement) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-surface-muted text-muted">
          <Link2Off aria-hidden="true" className="size-7" />
        </span>
        <h1 className="text-xl font-semibold text-text">This link isn&apos;t available</h1>
        <p className="text-sm text-muted">
          The payment link may have been replaced or turned off. Please ask {BRAND.name} for the latest link.
        </p>
      </main>
    );
  }

  const { company, project } = statement;
  const companyName = company?.name ?? BRAND.name;
  const totals = paymentTotals(Number(statement.totals.project_cost), Number(statement.totals.received));
  const byMode = statement.by_mode.map((m) => ({ mode: m.mode, amount: Number(m.amount), count: Number(m.count) }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:py-10 print:max-w-none print:py-0">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          {company?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary owner-provided logo URL
            <img src={company.logo_url} alt={companyName} className="h-11 w-auto max-w-[180px] object-contain" referrerPolicy="no-referrer" />
          ) : (
            <Image src={BRAND.logo} alt={companyName} width={164} height={49} priority className="h-11 w-auto" />
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {company?.phone ? (
              <a href={`tel:${company.phone}`} className="inline-flex items-center gap-1 hover:text-text">
                <Phone aria-hidden="true" className="size-3.5" />
                {company.phone}
              </a>
            ) : null}
            {company?.email ? (
              <a href={`mailto:${company.email}`} className="inline-flex items-center gap-1 hover:text-text">
                <Mail aria-hidden="true" className="size-3.5" />
                {company.email}
              </a>
            ) : null}
          </div>
        </div>
        <PrintButton />
      </header>

      <section aria-labelledby="statement-title" className="card-surface flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-strong">Payment statement</p>
          <h1 id="statement-title" className="text-2xl font-semibold tracking-tight text-text">
            {project.name}
          </h1>
          <p className="text-sm text-muted">
            {project.client_name} · {project.code}
            {project.city ? ` · ${project.city}` : ""}
          </p>
        </div>
        <PaymentTotalsGrid totals={totals} paymentCount={statement.payments.length} />
      </section>

      <section aria-labelledby="modes-title" className="card-surface flex flex-col gap-4 p-5 sm:p-6">
        <h2 id="modes-title" className="text-lg font-semibold text-text">
          Received by mode
        </h2>
        <PaymentModeBreakdown rows={byMode} received={totals.received} />
      </section>

      <section aria-labelledby="history-title" className="card-surface flex flex-col gap-4 p-5 sm:p-6">
        <h2 id="history-title" className="text-lg font-semibold text-text">
          Payment history
        </h2>
        {statement.payments.length === 0 ? (
          <p className="text-sm text-muted">No payments recorded yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border-soft">
            {statement.payments.map((p, i) => {
              const Icon = PAYMENT_MODE_ICONS[p.mode];
              return (
                <li key={`${p.paid_on}-${i}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-primary-strong">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">
                        {PAYMENT_MODE_LABELS[p.mode]} · {formatDate(p.paid_on)}
                      </p>
                      {p.reference ? <p className="break-all text-xs text-muted">Ref: {p.reference}</p> : null}
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold text-text">
                    <CurrencyText value={p.amount} />
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <footer className="flex flex-col gap-1 pb-4 text-center text-xs text-muted">
        <p>Updated {formatDateTime(statement.generated_at)}. Amounts in Indian Rupees.</p>
        <p>
          For questions about this statement, please contact {companyName}
          {company?.phone ? ` on ${company.phone}` : ""}.
        </p>
      </footer>
    </main>
  );
}
