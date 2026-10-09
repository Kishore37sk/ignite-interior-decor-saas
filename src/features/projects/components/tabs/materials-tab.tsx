import { Boxes, CircleCheck, ClipboardList, Hourglass, PackageCheck, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { CurrencyText } from "@/components/shared/currency-text";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { StatCard } from "@/components/shared/stat-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatQuantity } from "@/lib/format";
import { getProjectMaterials, type MaterialLine } from "../../queries";

export type MaterialsTabProps = {
  projectId: string;
  /** Owner only: material cost KPIs. */
  showCosts: boolean;
};

const LINE_STATE: Record<MaterialLine["state"], { label: string; tone: BadgeTone }> = {
  delivered: { label: "Delivered", tone: "success" },
  partial: { label: "Partially delivered", tone: "warning" },
  pending: { label: "Pending", tone: "primary" },
  cancelled: { label: "Cancelled / rejected", tone: "muted" },
};

/** Material KPIs (project_material_summary) + aggregated requirement lines. */
export async function MaterialsTab({ projectId, showCosts }: MaterialsTabProps) {
  const { summary, lines } = await getProjectMaterials(projectId, showCosts);
  const base = `/material-requests?project=${projectId}`;

  const columns: DataTableColumn<MaterialLine>[] = [
    {
      key: "material",
      header: "Material",
      mobile: "title",
      cell: (line) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-text">{line.materialName}</span>
          <span className="text-xs text-muted">{line.category ?? "Uncategorised"}</span>
        </div>
      ),
    },
    {
      key: "summary",
      header: "Requirement",
      mobile: "subtitle",
      cell: (line) => (
        <span className="text-sm text-text">
          {formatQuantity(line.quantity, line.unit)} {LINE_STATE[line.state].label.toLowerCase()}
        </span>
      ),
    },
    {
      key: "quantity",
      header: "Requested",
      align: "right",
      cell: (line) => <span className="tabular-nums">{formatQuantity(line.quantity, line.unit)}</span>,
    },
    {
      key: "delivered",
      header: "Delivered",
      align: "right",
      cell: (line) => <span className="tabular-nums">{formatQuantity(line.delivered, line.unit)}</span>,
    },
    {
      key: "state",
      header: "Status",
      cell: (line) => (
        <Badge tone={LINE_STATE[line.state].tone} size="sm">
          {LINE_STATE[line.state].label}
        </Badge>
      ),
    },
    {
      key: "requests",
      header: "Requests",
      interactive: true,
      hideBelowLg: true,
      cell: (line) => (
        <span className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
          {line.requestCodes.map((r) => (
            <Link key={r.id} href={`/material-requests/${r.id}`} className="font-medium text-primary-strong hover:underline">
              {r.code}
            </Link>
          ))}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total requests" value={summary?.total_requests ?? 0} icon={ClipboardList} href={base} />
        <StatCard label="Pending" value={summary?.pending_requests ?? 0} icon={Hourglass} href={`${base}&view=pending`} />
        <StatCard label="Approved" value={summary?.approved_requests ?? 0} icon={CircleCheck} href={`${base}&status=approved`} />
        {/* ordered_requests counts ordered + partially delivered; no single list filter matches both. */}
        <StatCard label="Ordered / part-delivered" value={summary?.ordered_requests ?? 0} icon={Truck} />
        <StatCard
          label="Delivered"
          value={summary?.delivered_requests ?? 0}
          icon={PackageCheck}
          href={`${base}&status=delivered`}
          variant="highlight"
        />
      </div>

      {showCosts && summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Pending material cost" value={<CurrencyText value={summary.pending_material_cost ?? 0} compact />} icon={Wallet} sub="Estimated, awaiting approval" />
          <StatCard label="Approved material cost" value={<CurrencyText value={summary.approved_material_cost ?? 0} compact />} icon={Wallet} sub="Approved for purchase" />
          <StatCard label="Actual material cost" value={<CurrencyText value={summary.actual_material_cost ?? 0} compact />} icon={Wallet} sub="Spent so far" />
        </div>
      ) : null}

      <DataTable
        title="Material requirements"
        caption="Materials requested for this project"
        columns={columns}
        rows={lines}
        getRowId={(line) => line.key}
        emptyState={
          <EmptyState
            icon={Boxes}
            title="No materials requested yet"
            description="Items from this project's material requests are totalled here, with delivered quantities."
          />
        }
      />
    </div>
  );
}
