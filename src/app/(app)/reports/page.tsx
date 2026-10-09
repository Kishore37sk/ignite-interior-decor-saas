import type { Metadata } from "next";
import { Suspense } from "react";
import { TableSkeleton } from "@/components/shared/loading-skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { MaterialReport } from "@/features/dashboard/reports/components/material-report";
import { AdminReport, SiteManagerReport } from "@/features/dashboard/reports/components/people-reports";
import { ProjectReport } from "@/features/dashboard/reports/components/project-report";
import {
  REPORT_LABELS,
  allowedReportTypes,
  isReportType,
  type ReportType,
} from "@/features/dashboard/reports/config";
import { requireUser } from "@/lib/auth";
import { getParam, type SearchParamsRecord } from "@/lib/search-params";

export const metadata: Metadata = { title: "Reports" };

type ReportsPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

/**
 * `/reports` (app.md §76, ARCHITECTURE §9). Owner: project, material, site manager and
 * admin reports. Admins and site managers: only the RLS-scoped material report.
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const allowed = allowedReportTypes(user.role);

  const requested = getParam(params, "tab");
  const active: ReportType =
    isReportType(requested) && allowed.includes(requested) ? requested : (allowed[0] ?? "materials");

  const isOwner = user.role === "owner";
  // A new key per filter combination makes the table stream in behind its skeleton.
  const suspenseKey = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      value === undefined ? [] : (Array.isArray(value) ? value : [value]).map((v) => [key, v] as [string, string]),
    ),
  ).toString();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description={
          isOwner
            ? "Filter any report, check the totals and export exactly what you see to CSV."
            : "Material requests on your projects. Filter, check the totals and export to CSV."
        }
      />

      {allowed.length > 1 ? (
        <LinkTabs
          label="Report type"
          active={active}
          items={allowed.map((type) => ({ value: type, label: REPORT_LABELS[type], href: `/reports?tab=${type}` }))}
        />
      ) : null}

      <Suspense key={suspenseKey} fallback={<TableSkeleton rows={8} columns={7} />}>
        {active === "projects" ? (
          <ProjectReport params={params} />
        ) : active === "site-managers" ? (
          <SiteManagerReport params={params} />
        ) : active === "admins" ? (
          <AdminReport params={params} />
        ) : (
          <MaterialReport params={params} role={user.role} />
        )}
      </Suspense>
    </div>
  );
}
