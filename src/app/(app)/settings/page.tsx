import { ArrowRight, BellRing, Building2, HardHat, Lock, ShieldCheck, Tags, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { CLOSED_PROJECT_STATUSES, DEADLINE_REMINDER_DAYS, ONGOING_PROJECT_STATUSES, PROJECT_STATUSES } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { CategoryManager } from "@/features/settings/components/category-manager";
import { CompanySettingsForm } from "@/features/settings/components/company-settings-form";
import { DeadlineCheckButton } from "@/features/settings/components/deadline-check-button";
import { countMaterialsByCategory, getCompanySettings, listMaterialCategories } from "@/features/settings/queries";
import type { ProjectStatus } from "@/types/database";

export const metadata: Metadata = { title: "Settings" };

const STATUS_NOTES: Record<ProjectStatus, string> = {
  planning: "Scope, budget and schedule being agreed.",
  design: "Drawings and 3D designs in progress.",
  approval: "Waiting for client sign-off.",
  procurement: "Materials being sourced and ordered.",
  execution: "Work under way on site.",
  finishing: "Final touches, snagging and cleaning.",
  handover_pending: "Ready — waiting for the handover date.",
  completed: "Handed over to the client.",
  on_hold: "Paused (neither ongoing nor closed).",
  delayed: "Manually flagged as delayed.",
  cancelled: "Stopped; kept for history.",
};

function statusGroup(status: ProjectStatus): string {
  if ((CLOSED_PROJECT_STATUSES as readonly ProjectStatus[]).includes(status)) return "Closed";
  if ((ONGOING_PROJECT_STATUSES as readonly ProjectStatus[]).includes(status)) return "Ongoing";
  return "Paused";
}

export default async function SettingsPage() {
  await requireRole("owner");
  const [company, categories, materialCounts] = await Promise.all([
    getCompanySettings(),
    listMaterialCategories(),
    countMaterialsByCategory(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]}
        description="Company details, material categories, project statuses and reminders."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard
            id="company"
            title={
              <span className="flex items-center gap-2">
                <Building2 aria-hidden="true" className="size-5 text-primary-strong" />
                Company
              </span>
            }
            description={
              company?.updated_at
                ? `The name and logo appear in the app sidebar; contact details are kept for your records. Last updated ${formatDateTime(company.updated_at)}.`
                : "The name and logo appear in the app sidebar; contact details are kept for your records."
            }
          >
            {company ? (
              <CompanySettingsForm
                defaults={{
                  company_name: company.company_name,
                  logo_url: company.logo_url ?? "",
                  contact_name: company.contact_name ?? "",
                  email: company.email ?? "",
                  phone: company.phone ?? "",
                  address: company.address ?? "",
                }}
              />
            ) : (
              <p role="alert" className="rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning-text">
                The company settings row is missing from the database. Re-run <code>supabase/setup.sql</code> in the
                Supabase SQL editor, then reload this page.
              </p>
            )}
          </SectionCard>

          <SectionCard
            id="statuses"
            title={
              <span className="flex items-center gap-2">
                <Lock aria-hidden="true" className="size-5 text-primary-strong" />
                Project Statuses
              </span>
            }
            description="Statuses are system-defined so dashboards, delay logic and reports stay consistent. They are intentionally not configurable."
          >
            <ul className="flex flex-col divide-y divide-border-soft">
              {PROJECT_STATUSES.map((status) => (
                <li key={status} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                  <span className="sm:w-44">
                    <StatusBadge kind="project" value={status} size="sm" />
                  </span>
                  <span className="flex-1 text-sm text-muted">{STATUS_NOTES[status]}</span>
                  <span className="text-xs font-medium text-muted">{statusGroup(status)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              “Delayed” on dashboards also includes any project past its expected completion date, whatever its status.
            </p>
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard
            id="categories"
            title={
              <span className="flex items-center gap-2">
                <Tags aria-hidden="true" className="size-5 text-primary-strong" />
                Material Categories
              </span>
            }
            description="Used to group the material catalog and request items. Order here is the order shown in pickers."
          >
            <CategoryManager
              categories={categories.map((c) => ({
                id: c.id,
                name: c.name,
                is_active: c.is_active,
                materials: materialCounts[c.name] ?? 0,
              }))}
            />
          </SectionCard>

          <SectionCard
            id="notifications"
            title={
              <span className="flex items-center gap-2">
                <BellRing aria-hidden="true" className="size-5 text-primary-strong" />
                Deadline Reminders
              </span>
            }
            description={`Every day at 08:00 IST the system notifies the owner and assigned site managers about projects due in ${DEADLINE_REMINDER_DAYS.filter((d) => d > 0).join(", ")} days, due today or overdue — and admins/requesters about material requests needed within 2 days.`}
          >
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                Run the same check now — for example after changing several deadlines. Reminders are never duplicated:
                each person gets each reminder (30, 14, 7, 1 days, due, overdue) only once per deadline.
              </p>
              <DeadlineCheckButton />
              <p className="text-xs text-muted">
                The daily schedule uses Supabase pg_cron. If it isn&apos;t enabled on your project, use this button or
                schedule <code>generate_deadline_notifications()</code> externally.
              </p>
            </div>
          </SectionCard>

          <SectionCard
            id="users"
            title={
              <span className="flex items-center gap-2">
                <UsersRound aria-hidden="true" className="size-5 text-primary-strong" />
                Users
              </span>
            }
            description="Add admins and site managers, send password setup links, assign projects and deactivate accounts."
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button asChild>
                <Link href="/users">
                  Manage users <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/site-managers">
                  <HardHat aria-hidden="true" /> Site managers
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/admins">
                  <ShieldCheck aria-hidden="true" /> Admins
                </Link>
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
