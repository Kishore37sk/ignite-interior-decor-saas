import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { StaffProfileCard } from "@/features/users/components/staff-profile-card";
import {
  ChangePasswordForm,
  ProfileDetailsForm,
  SignOutEverywhereButton,
} from "@/features/users/profile/profile-forms";
import { getStaffProfile } from "@/features/users/queries";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getStaffProfile(user.id);
  if (!profile) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Profile"
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Profile" }]}
        description="Your contact details, password and signed-in devices."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <StaffProfileCard profile={profile} />

        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <UserRound aria-hidden="true" className="size-5 text-primary-strong" />
                Personal Details
              </span>
            }
            description="Your name and phone are shown to the owner and on projects you work on."
          >
            <ProfileDetailsForm
              defaults={{ full_name: profile.full_name, phone: profile.phone ?? "" }}
              email={profile.email}
              roleLabel={ROLE_LABELS[user.role]}
              employeeId={profile.employee_id}
            />
          </SectionCard>

          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <KeyRound aria-hidden="true" className="size-5 text-primary-strong" />
                Change Password
              </span>
            }
            description="Choose a new password for your account. Nobody else — including the owner — can see it."
          >
            <ChangePasswordForm />
          </SectionCard>

          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="size-5 text-primary-strong" />
                Sessions
              </span>
            }
            description="Lost a phone or signed in on a shared computer? End every session at once."
          >
            <SignOutEverywhereButton />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
