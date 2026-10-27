import { Pencil, ReceiptIndianRupee } from "lucide-react";
import Link from "next/link";
import { CurrencyText } from "@/components/shared/currency-text";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { SectionCard } from "@/components/shared/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PAYMENT_MODE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/format";
import type { ProjectDirectoryRow, ProjectPayment } from "@/types/database";
import { getProjectFinancials } from "@/features/projects/queries";
import { getPaymentLinkToken, listProjectPayments } from "../queries";
import { paymentTotals, statementUrl } from "../statement";
import { PaymentDeleteButton } from "./payment-delete-button";
import { PaymentDialog } from "./payment-dialog";
import { PaymentLinkCard } from "./payment-link-card";
import { PAYMENT_MODE_ICONS, PaymentModeBreakdown, PaymentTotalsGrid, totalsByMode } from "./payment-summary";

export type PaymentsTabProps = {
  project: ProjectDirectoryRow;
  /** Owner: record/edit/delete payments and manage the client link. */
  canManage: boolean;
};

/** Client payments: totals, split by mode, history and the shareable statement link. */
export async function PaymentsTab({ project, canManage }: PaymentsTabProps) {
  const [financials, payments, token] = await Promise.all([
    getProjectFinancials(project.id),
    listProjectPayments(project.id),
    canManage ? getPaymentLinkToken(project.id) : Promise.resolve(null),
  ]);
  const received = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totals = paymentTotals(Number(financials?.project_cost ?? 0), received);
  const byMode = totalsByMode(payments);

  const columns: DataTableColumn<ProjectPayment>[] = [
    {
      key: "paid_on",
      header: "Date",
      mobile: "subtitle",
      cell: (p) => <span className="whitespace-nowrap tabular-nums">{formatDate(p.paid_on)}</span>,
    },
    {
      key: "mode",
      header: "Mode",
      cell: (p) => {
        const Icon = PAYMENT_MODE_ICONS[p.mode];
        return (
          <Badge tone="soft" size="sm" className="gap-1.5">
            <Icon aria-hidden="true" className="size-3.5" />
            {PAYMENT_MODE_LABELS[p.mode]}
          </Badge>
        );
      },
    },
    {
      key: "reference",
      header: "Reference",
      cell: (p) => <span className="break-all text-sm text-text">{p.reference ?? <span className="text-muted">—</span>}</span>,
    },
    {
      key: "notes",
      header: "Internal notes",
      hideBelowLg: true,
      cell: (p) => <span className="line-clamp-2 text-sm text-muted">{p.notes ?? "—"}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      mobile: "title",
      cell: (p) => (
        <span className="font-semibold text-text">
          <CurrencyText value={p.amount} />
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "Actions",
            align: "right" as const,
            interactive: true,
            cell: (p: ProjectPayment) => (
              <span className="flex justify-end gap-1">
                <PaymentDialog
                  projectId={project.id}
                  payment={{ id: p.id, amount: Number(p.amount), paid_on: p.paid_on, mode: p.mode, reference: p.reference, notes: p.notes }}
                />
                <PaymentDeleteButton
                  projectId={project.id}
                  paymentId={p.id}
                  label={`${formatINR(p.amount)} (${PAYMENT_MODE_LABELS[p.mode]}, ${formatDate(p.paid_on)})`}
                />
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="flex min-w-0 flex-col gap-6">
        <SectionCard
          title="Payment summary"
          description={canManage ? "Project value comes from the project's cost." : "Shared with you by the owner."}
          action={
            canManage ? (
              <>
                {totals.projectCost === 0 ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/projects/${project.id}/edit`}>
                      <Pencil aria-hidden="true" />
                      Set project value
                    </Link>
                  </Button>
                ) : null}
                <PaymentDialog projectId={project.id} balance={totals.balance} />
              </>
            ) : null
          }
        >
          <PaymentTotalsGrid totals={totals} paymentCount={payments.length} />
        </SectionCard>

        <DataTable
          title="Payment history"
          caption="Payments received for this project"
          columns={columns}
          rows={payments}
          getRowId={(p) => p.id}
          emptyState={
            <EmptyState
              compact
              icon={ReceiptIndianRupee}
              title="No payments recorded"
              description={canManage ? "Record each amount the client pays, with the mode (cash, card, UPI and more)." : "The owner hasn't recorded any payments yet."}
            />
          }
        />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <SectionCard title="Received by mode">
          <PaymentModeBreakdown rows={byMode} received={received} />
        </SectionCard>
        {canManage ? (
          <SectionCard title="Client payment link" description="A read-only statement your client can open without logging in.">
            <PaymentLinkCard
              projectId={project.id}
              projectName={project.name}
              clientName={project.client_name}
              url={token ? statementUrl(token) : null}
            />
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}
