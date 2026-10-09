import type { Metadata } from "next";
import { AdminDashboard } from "@/features/dashboard/components/admin/admin-dashboard";
import { OwnerDashboard } from "@/features/dashboard/components/owner/owner-dashboard";
import { SiteManagerDashboard } from "@/features/dashboard/components/site-manager/site-manager-dashboard";
import { requireRouteAccess } from "@/lib/auth";
import { parsePage, parsePageSize, type SearchParamsRecord } from "@/lib/search-params";

export const metadata: Metadata = { title: "Dashboard" };

type DashboardPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

/** `/dashboard` renders the dashboard for the signed-in user's role. */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireRouteAccess("/dashboard");

  switch (user.role) {
    case "owner":
      return <OwnerDashboard />;
    case "site_manager":
      return <SiteManagerDashboard userId={user.id} />;
    case "admin": {
      const params = await searchParams;
      return <AdminDashboard page={parsePage(params)} pageSize={parsePageSize(params, 10)} />;
    }
  }
}
