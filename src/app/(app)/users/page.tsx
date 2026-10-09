import { HardHat, SearchX, ShieldCheck, UserRoundX, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import type { SearchParamsRecord } from "@/lib/search-params";
import { AddUserDialog } from "@/features/users/components/add-user-dialog";
import { profileHref, toManagedUser } from "@/features/users/components/types";
import { UserActions } from "@/features/users/components/user-actions";
import { getEmployeeIdSuggestions, listUsers, type UserListRow } from "@/features/users/queries";
import { getTeamCounts } from "@/features/users/stats";

export const metadata: Metadata = { title: "Users" };

type PageProps = { searchParams: Promise<SearchParamsRecord> };

const ROLE_TONES = { owner: "deep", admin: "info", site_manager: "soft" } as const;

export default async function UsersPage({ searchParams }: PageProps) {
  const owner = await requireRole("owner");
  const params = await searchParams;
  const [{ filters, rows, total }, suggestions, counts] = await Promise.all([
    listUsers(params),
    getEmployeeIdSuggestions(),
    getTeamCounts(),
  ]);
  const hasFilters = Boolean(filters.q || filters.role || filters.status);

  const columns: DataTableColumn<UserListRow>[] = [
    {
      key: "name",
      header: "User",
      sortable: true,
      mobile: "title",
      className: "min-w-56",
      cell: (row) => (
        <UserAvatar name={row.full_name} avatarUrl={row.avatar_url} userId={row.id} subtitle={row.email} />
      ),
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      cell: (row) =>
        row.role ? (
          <Badge tone={ROLE_TONES[row.role]} size="sm">
            {ROLE_LABELS[row.role]}
          </Badge>
        ) : (
          <Badge tone="warning" size="sm">
            No access
          </Badge>
        ),
    },
    {
      key: "employee_id",
      header: "Employee ID",
      sortable: true,
      cell: (row) => <span className="font-medium tabular-nums">{row.employee_id ?? "—"}</span>,
    },
    {
      key: "phone",
      header: "Phone",
      hideBelowLg: true,
      cell: (row) => <span className="tabular-nums">{row.phone ?? "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (row) => <StatusBadge kind="user" value={row.status} size="sm" />,
    },
    {
      key: "projects",
      header: "Projects",
      align: "center",
      cell: (row) =>
        row.role === "owner" ? (
          <span className="text-muted">All</span>
        ) : (
          <span className="tabular-nums">{formatNumber(row.assigned_projects, 0)}</span>
        ),
    },
    {
      key: "joining_date",
      header: "Joined",
      sortable: true,
      cell: (row) => <span className="tabular-nums">{formatDate(row.joining_date)}</span>,
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      hideBelowLg: true,
      cell: (row) => <span className="tabular-nums">{formatDate(row.created_at)}</span>,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      interactive: true,
      mobileLabel: "Actions",
      cell: (row) => (
        <UserActions user={toManagedUser(row)} currentUserId={owner.id} showProfileLink />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Users" }]}
        description="Create logins for admins and site managers, send password setup links, assign projects and deactivate people who leave. History is never deleted."
        actions={<AddUserDialog suggestions={suggestions} />}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Team Members" value={formatNumber(counts.total, 0)} unit="users" icon={UsersRound} />
        <StatCard
          label="Site Managers"
          value={formatNumber(counts.activeSiteManagers, 0)}
          unit="active"
          icon={HardHat}
          href="/users?role=site_manager&status=active"
        />
        <StatCard
          label="Admins"
          value={formatNumber(counts.activeAdmins, 0)}
          unit="active"
          icon={ShieldCheck}
          href="/users?role=admin&status=active"
        />
        <StatCard
          label="Inactive"
          value={formatNumber(counts.inactive, 0)}
          unit="users"
          icon={UserRoundX}
          href="/users?status=inactive"
        />
      </div>

      <DataTable
        title="All Users"
        caption="Users"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        getRowHref={(row) => profileHref(row)}
        getRowLabel={(row) => `Open ${row.full_name}'s profile`}
        sort={{ key: filters.sort, dir: filters.dir }}
        pagination={{ total, page: filters.page, pageSize: filters.pageSize, itemLabel: "users" }}
        toolbar={
          <FilterBar
            searchPlaceholder="Search name, email, phone, employee ID…"
            filters={[
              {
                param: "role",
                label: "Role",
                allLabel: "All roles",
                options: [
                  { value: "site_manager", label: "Site Manager" },
                  { value: "admin", label: "Admin" },
                  { value: "owner", label: "Owner" },
                ],
              },
              {
                param: "status",
                label: "Status",
                allLabel: "Any status",
                options: [
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ],
              },
            ]}
          />
        }
        emptyState={
          hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="No users match these filters"
              description="Try a different search term or clear the filters."
            />
          ) : (
            <EmptyState
              icon={UsersRound}
              title="No team members yet"
              description="Add your first site manager or admin. They'll receive a secure link to set their own password."
              action={<AddUserDialog suggestions={suggestions} />}
            />
          )
        }
      />
    </div>
  );
}
