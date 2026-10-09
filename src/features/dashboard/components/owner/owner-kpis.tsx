import {
  CalendarClock,
  CircleCheckBig,
  ClipboardList,
  Contact,
  FolderKanban,
  Hammer,
  IndianRupee,
  PackageX,
  TriangleAlert,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { UPCOMING_HANDOVER_DAYS } from "@/lib/constants";
import { formatINR, formatNumber, formatPercent } from "@/lib/format";
import { getOwnerStats } from "../../queries";
import { WidgetError } from "../widget-states";
import { MaterialCostCard } from "./material-cost-card";

function share(part: number, whole: number): string {
  return whole > 0 ? formatPercent((part / whole) * 100, 0) : "0%";
}

/** Owner KPI cards — every card drills down to the matching filtered list (ARCHITECTURE §9). */
export async function OwnerKpis() {
  const result = await getOwnerStats();
  if (!result.ok) return <WidgetError title="Company overview" message={result.error} />;
  const s = result.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Clients"
          value={formatNumber(s.total_clients, 0)}
          unit={s.total_clients === 1 ? "Client" : "Clients"}
          icon={Contact}
          href="/clients"
          footer={
            <>
              Active clients with <strong>{formatNumber(s.ongoing_projects, 0)}</strong> ongoing{" "}
              {s.ongoing_projects === 1 ? "project" : "projects"}
            </>
          }
        />
        <StatCard
          label="Total Projects"
          value={formatNumber(s.total_projects, 0)}
          unit={s.total_projects === 1 ? "Project" : "Projects"}
          icon={FolderKanban}
          href="/projects"
          footer={
            s.on_hold_projects > 0 ? (
              <>
                <strong>{formatNumber(s.on_hold_projects, 0)}</strong> on hold right now
              </>
            ) : (
              <>No projects on hold</>
            )
          }
        />
        <StatCard
          label="Ongoing Projects"
          value={formatNumber(s.ongoing_projects, 0)}
          unit="In progress"
          icon={Hammer}
          href="/projects?view=ongoing"
          variant="highlight"
          footer={
            <>
              <strong>{share(s.ongoing_projects, s.total_projects)}</strong> of all projects are active
            </>
          }
        />
        <StatCard
          label="Completed Projects"
          value={formatNumber(s.completed_projects, 0)}
          unit="Handed over"
          icon={CircleCheckBig}
          href="/projects?view=completed"
          footer={
            <>
              <strong>{share(s.completed_projects, s.total_projects)}</strong> of all projects delivered
            </>
          }
        />
        <StatCard
          label="Upcoming Handovers"
          value={formatNumber(s.upcoming_handovers, 0)}
          unit={`Next ${UPCOMING_HANDOVER_DAYS} days`}
          icon={CalendarClock}
          href="/projects?view=upcoming_handover"
          footer={
            s.upcoming_handovers > 0 ? (
              <>
                <strong>{formatNumber(s.upcoming_handovers, 0)}</strong> handover
                {s.upcoming_handovers === 1 ? "" : "s"} to prepare for
              </>
            ) : (
              <>No handovers due this month</>
            )
          }
        />
        <StatCard
          label="Delayed Projects"
          value={formatNumber(s.delayed_projects, 0)}
          unit="Past deadline"
          icon={TriangleAlert}
          href="/projects?view=delayed"
          variant={s.delayed_projects > 0 ? "danger" : "default"}
          footer={
            s.delayed_projects > 0 ? (
              <>
                <strong>Needs attention</strong> — overdue or marked delayed
              </>
            ) : (
              <>Every active project is on schedule</>
            )
          }
        />
        <StatCard
          label="Pending Material Requests"
          value={formatNumber(s.pending_material_requests, 0)}
          unit="Awaiting review"
          icon={ClipboardList}
          href="/material-requests?view=pending"
          footer={
            s.pending_material_requests > 0 ? (
              <>Requested or in review by admins</>
            ) : (
              <>No requests waiting for review</>
            )
          }
        />
        <StatCard
          label="Overdue Material Requests"
          value={formatNumber(s.overdue_material_requests, 0)}
          unit="Past required date"
          icon={PackageX}
          href="/material-requests?view=overdue"
          variant={s.overdue_material_requests > 0 ? "danger" : "default"}
          footer={
            s.overdue_material_requests > 0 ? (
              <>
                <strong>Follow up</strong> — still open after the required date
              </>
            ) : (
              <>All open requests are within their dates</>
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          label="Total Project Value"
          value={formatINR(s.total_project_value, { compact: true })}
          unit="Contract value"
          sub={<span className="tabular-nums">{formatINR(s.total_project_value)}</span>}
          icon={IndianRupee}
          href="/reports?tab=projects"
          footer={<>Sum of project costs, excluding cancelled projects</>}
        />
        <MaterialCostCard
          estimated={s.material_estimated_cost}
          approved={s.material_approved_cost}
          actual={s.material_actual_cost}
          variance={s.material_variance}
          varianceBasis={s.material_variance_estimated_cost}
          className="lg:col-span-2"
        />
      </div>
    </div>
  );
}
