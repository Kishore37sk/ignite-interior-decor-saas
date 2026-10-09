"use client";

import { CHART_COLORS, DonutChart, SimpleBarChart, type DonutSlice } from "@/components/shared/charts";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS } from "@/lib/constants";
import { formatMonth } from "@/lib/dates";
import type { ProjectStatus } from "@/types/database";

/**
 * One distinct colour per project status. Dark tones are theme tokens (white legend
 * text is readable on them); light tones come from the shared chart palette.
 */
const STATUS_COLORS: Record<ProjectStatus, string> = {
  planning: CHART_COLORS.softStrong,
  design: CHART_COLORS.info,
  approval: CHART_COLORS.lime,
  procurement: "var(--color-info-text)",
  execution: CHART_COLORS.primary,
  finishing: "var(--color-primary-strong)",
  handover_pending: CHART_COLORS.warning,
  completed: CHART_COLORS.deep,
  on_hold: "var(--color-warning-text)",
  delayed: CHART_COLORS.danger,
  cancelled: CHART_COLORS.grey,
};

export function ProjectStatusDonut({
  breakdown,
  total,
}: {
  breakdown: readonly { status: ProjectStatus; count: number }[];
  total: number;
}) {
  const counts = new Map(breakdown.map((item) => [item.status, item.count]));
  const slices: DonutSlice[] = PROJECT_STATUSES.filter((status) => (counts.get(status) ?? 0) > 0).map(
    (status) => ({
      name: PROJECT_STATUS_LABELS[status],
      value: counts.get(status) ?? 0,
      color: STATUS_COLORS[status],
      href: `/projects?status=${status}`,
    }),
  );

  return (
    <DonutChart
      data={slices}
      centerValue={total}
      centerLabel={total === 1 ? "Project" : "Projects"}
      size={200}
      ariaLabel="Projects by status. Select a status in the legend to open the filtered project list."
    />
  );
}

export function MonthlyMaterialCostChart({
  data,
}: {
  data: readonly { month: string; estimated: number; actual: number }[];
}) {
  const rows = data.map((item) => ({
    month: formatMonth(item.month).replace(/ \d{4}$/, ""),
    estimated: item.estimated,
    actual: item.actual,
  }));

  return (
    <SimpleBarChart
      data={rows}
      categoryKey="month"
      series={[
        { key: "estimated", name: "Estimated", color: CHART_COLORS.softStrong },
        { key: "actual", name: "Actual", color: CHART_COLORS.deep },
      ]}
      format="inr_compact"
      height={260}
      ariaLabel="Monthly material cost, estimated versus actual, for the last six months"
      emptyMessage="No material costs recorded in the last 6 months"
    />
  );
}
