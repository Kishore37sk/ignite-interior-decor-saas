import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ChartCard } from "@/components/shared/chart-card";
import { formatINR } from "@/lib/format";
import { getOwnerStats } from "../../queries";
import { WidgetError } from "../widget-states";
import { MonthlyMaterialCostChart, ProjectStatusDonut } from "./owner-chart-views";

const linkClass =
  "inline-flex h-9 items-center gap-1 rounded-xl bg-soft px-3 text-sm font-semibold text-deep transition-colors hover:bg-soft-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export async function ProjectStatusCard({ className }: { className?: string }) {
  const result = await getOwnerStats();
  if (!result.ok) return <WidgetError title="Project status" message={result.error} className={className} />;
  const { status_breakdown, total_projects } = result.data;

  return (
    <ChartCard
      title="Project Status"
      subtitle="Select a status to see those projects"
      actions={
        <Link href="/projects" className={linkClass}>
          All projects
        </Link>
      }
      minHeight={320}
      className={className}
    >
      <ProjectStatusDonut breakdown={status_breakdown} total={total_projects} />
    </ChartCard>
  );
}

export async function MonthlyMaterialCostCard({ className }: { className?: string }) {
  const result = await getOwnerStats();
  if (!result.ok) return <WidgetError title="Monthly material cost" message={result.error} className={className} />;
  const months = result.data.monthly_material_cost;
  const totals = months.reduce(
    (acc, item) => ({ estimated: acc.estimated + item.estimated, actual: acc.actual + item.actual }),
    { estimated: 0, actual: 0 },
  );

  return (
    <ChartCard
      title="Monthly Material Cost"
      subtitle="Estimated vs actual cost of material requests raised each month (last 6 months)"
      actions={
        <Link href="/reports?tab=materials" className={linkClass}>
          Material report
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      }
      headline={
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <p className="flex items-baseline gap-1.5">
            <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-text">
              {formatINR(totals.actual, { compact: true })}
            </span>
            <span className="text-xs font-medium text-muted">actual in 6 months</span>
          </p>
          <p className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tabular-nums text-muted">
              {formatINR(totals.estimated, { compact: true })}
            </span>
            <span className="text-xs font-medium text-muted">estimated</span>
          </p>
        </div>
      }
      minHeight={280}
      className={className}
    >
      <MonthlyMaterialCostChart data={months} />
    </ChartCard>
  );
}
