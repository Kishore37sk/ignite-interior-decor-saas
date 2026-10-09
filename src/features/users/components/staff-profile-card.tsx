import { BadgeCheck, CalendarDays, Clock, Mail, Phone, UserRoundX } from "lucide-react";
import { InfoList, InfoRow } from "@/components/shared/info-row";
import { StatusBadge } from "@/components/shared/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, relativeTime } from "@/lib/dates";
import type { StaffProfile } from "../queries";

/** TeamHub "employee details" card: big avatar, name, role, employee-ID and status pills, key facts. */
export function StaffProfileCard({ profile, lastActive }: { profile: StaffProfile; lastActive?: string | null }) {
  const roleLabel = profile.role ? ROLE_LABELS[profile.role] : "No access";
  return (
    <div className="flex flex-col gap-4">
      <section aria-label={`${profile.full_name} profile`} className="card-surface flex flex-col items-center gap-4 p-5 sm:p-6">
        <Avatar
          name={profile.full_name}
          src={profile.avatar_url}
          colorSeed={profile.id}
          size="2xl"
          decorative
          className="size-32 rounded-3xl text-4xl"
        />
        <div className="flex flex-col items-center gap-1 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-text">{profile.full_name}</h2>
          <p className="text-sm text-muted">{roleLabel} · Ignite Interior Decor</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex h-8 items-center rounded-full bg-surface-sunken px-3 text-sm font-medium tabular-nums text-text">
            {profile.employee_id ?? "No employee ID"}
          </span>
          <StatusBadge kind="user" value={profile.status} size="lg" />
        </div>
        <dl className="w-full divide-y divide-border-soft rounded-xl bg-surface-muted text-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-muted">Role</dt>
            <dd className="font-medium text-text">{roleLabel}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-muted">Joined</dt>
            <dd className="font-medium text-text">{formatDate(profile.joining_date, "Not set")}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-muted">Account created</dt>
            <dd className="font-medium text-text">{formatDate(profile.created_at)}</dd>
          </div>
        </dl>
        {profile.status === "inactive" ? (
          <p className="flex w-full items-start gap-2 rounded-xl bg-warning-bg px-3 py-2 text-xs text-warning-text">
            <UserRoundX aria-hidden="true" className="mt-px size-4 shrink-0" />
            <span>
              Deactivated {profile.deactivated_at ? `on ${formatDateTime(profile.deactivated_at)}` : ""}. They can&apos;t
              sign in; their history stays visible.
            </span>
          </p>
        ) : null}
      </section>

      <section aria-labelledby="contact-title" className="card-surface flex flex-col gap-4 p-5 sm:p-6">
        <h2 id="contact-title" className="text-lg font-semibold tracking-tight text-text">
          Contact Info
        </h2>
        <InfoList>
          <InfoRow
            icon={Mail}
            label="Email Address"
            value={
              <a href={`mailto:${profile.email}`} className="break-all hover:text-primary-strong hover:underline">
                {profile.email}
              </a>
            }
          />
          <InfoRow
            icon={Phone}
            label="Phone"
            value={
              profile.phone ? (
                <a href={`tel:${profile.phone}`} className="hover:text-primary-strong hover:underline">
                  {profile.phone}
                </a>
              ) : null
            }
            fallback="Not added"
          />
          <InfoRow icon={CalendarDays} label="Joining Date" value={formatDate(profile.joining_date, "")} fallback="Not set" />
          <InfoRow icon={BadgeCheck} label="Employee ID" value={profile.employee_id} fallback="Not set" />
          {lastActive !== undefined ? (
            <InfoRow
              icon={Clock}
              label="Last Activity"
              value={lastActive ? relativeTime(lastActive) : null}
              fallback="No activity yet"
            />
          ) : null}
        </InfoList>
      </section>
    </div>
  );
}
