import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StatusScreen, primaryActionClass, secondaryActionClass } from "@/components/shell/status-screen";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Access denied" };

export default async function ForbiddenPage() {
  const user = await requireUser();

  return (
    <StatusScreen
      icon={ShieldX}
      code="403"
      title="You don't have access to this page"
      description={`This area isn't available for the ${ROLE_LABELS[user.role]} role. If you think you need access, contact the owner.`}
      actions={
        <>
          <Link href="/dashboard" className={primaryActionClass}>
            Go to dashboard
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className={`${secondaryActionClass} w-full`}>
              Sign in as someone else
            </button>
          </form>
        </>
      }
    />
  );
}
