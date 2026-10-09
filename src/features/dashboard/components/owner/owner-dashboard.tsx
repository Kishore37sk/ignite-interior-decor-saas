import { ChartColumn, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { RecentActivity } from "../recent-activity";
import { CardSkeleton, KpiGridSkeleton } from "../widget-states";
import { NeedsAttention, UpcomingHandovers } from "./attention-lists";
import { MonthlyMaterialCostCard, ProjectStatusCard } from "./owner-charts";
import { OwnerKpis } from "./owner-kpis";
import { AdminPerformanceTable, SiteManagerPerformanceTable } from "./performance-tables";
import { ProjectGantt } from "./project-gantt";

/**
 * Owner executive dashboard (app.md §10, §11, §34, §75, §78, §79, §113). Each widget
 * streams independently behind its own Suspense boundary and fails in isolation.
 */
export function OwnerDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Clients, projects, materials and team performance at a glance. Every figure opens the matching list."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/reports">
                <ChartColumn aria-hidden="true" />
                Reports
              </Link>
            </Button>
            <Button asChild>
              <Link href="/projects/new">
                <Plus aria-hidden="true" />
                New project
              </Link>
            </Button>
          </>
        }
      />

      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <KpiGridSkeleton count={8} />
            <KpiGridSkeleton count={2} className="xl:grid-cols-2" />
          </div>
        }
      >
        <OwnerKpis />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Suspense fallback={<CardSkeleton label="Loading project status…" height={320} />}>
          <ProjectStatusCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton label="Loading material costs…" height={320} className="lg:col-span-2" />}>
          <MonthlyMaterialCostCard className="lg:col-span-2" />
        </Suspense>
      </div>

      <Suspense fallback={<CardSkeleton label="Loading project timeline…" height={360} />}>
        <ProjectGantt />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Suspense fallback={<CardSkeleton label="Loading items needing attention…" rows={5} className="xl:col-span-2" />}>
          <NeedsAttention className="xl:col-span-2" />
        </Suspense>
        <Suspense fallback={<CardSkeleton label="Loading upcoming handovers…" rows={5} />}>
          <UpcomingHandovers />
        </Suspense>
      </div>

      <Suspense fallback={<CardSkeleton label="Loading site manager performance…" rows={5} />}>
        <SiteManagerPerformanceTable />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Suspense fallback={<CardSkeleton label="Loading admin performance…" rows={4} className="xl:col-span-2" />}>
          <AdminPerformanceTable className="xl:col-span-2" />
        </Suspense>
        <Suspense fallback={<CardSkeleton label="Loading recent activity…" rows={6} />}>
          <RecentActivity role="owner" description="Latest changes across all projects" />
        </Suspense>
      </div>
    </div>
  );
}
