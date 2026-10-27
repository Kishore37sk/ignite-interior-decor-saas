"use client";

import { ShieldCheck, TriangleAlert, UserMinus, UserPlus, UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MEMBER_ROLE_LABELS } from "@/lib/constants";
import type { MemberRole, UserStatus } from "@/types/database";
import { assignProjectMemberAction, removeProjectMemberAction } from "../actions";

export type TeamMemberView = {
  userId: string;
  memberRole: MemberRole;
  canViewFinancials: boolean;
  name: string;
  employeeId: string | null;
  avatarUrl: string | null;
  status: UserStatus;
};

export type PersonOption = { id: string; label: string };

export type ProjectTeamManagerProps = {
  projectId: string;
  archived: boolean;
  members: readonly TeamMemberView[];
  siteManagerOptions: readonly PersonOption[];
  adminOptions: readonly PersonOption[];
};

type DialogState = { role: MemberRole; replace: boolean; replacing?: TeamMemberView } | null;

/** Owner team card: assign/replace site manager, add admins, financial access, remove members. */
export function ProjectTeamManager({ projectId, archived, members, siteManagerOptions, adminOptions }: ProjectTeamManagerProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const siteManagers = members.filter((m) => m.memberRole === "site_manager");
  const admins = members.filter((m) => m.memberRole === "admin");
  const inactiveSm = siteManagers.some((m) => m.status !== "active");

  function toggleFinancials(member: TeamMemberView, next: boolean) {
    setToggling(member.userId);
    startTransition(async () => {
      const result = await assignProjectMemberAction({
        project_id: projectId,
        user_id: member.userId,
        member_role: member.memberRole,
        can_view_financials: next,
        replace_existing: false,
      }).catch(() => ({ ok: false as const, error: "We couldn't reach the server. Please try again." }));
      setToggling(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(next ? `${member.name} can now view project financials.` : `${member.name} can no longer view financials.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {inactiveSm ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-warning-bg px-3 py-2.5 text-sm text-warning-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>The assigned site manager is inactive. Reassign the project so updates keep coming in.</span>
        </div>
      ) : siteManagers.length === 0 ? (
        <div role="status" className="flex items-start gap-2 rounded-xl bg-warning-bg px-3 py-2.5 text-sm text-warning-text">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>No site manager is assigned to this project yet.</span>
        </div>
      ) : null}

      <MemberGroup
        title="Site Manager"
        members={siteManagers}
        toggling={toggling}
        archived={archived}
        projectId={projectId}
        onToggle={toggleFinancials}
        onReplace={(member) => setDialog({ role: "site_manager", replace: true, replacing: member })}
      />
      <MemberGroup
        title="Admins"
        members={admins}
        toggling={toggling}
        archived={archived}
        projectId={projectId}
        onToggle={toggleFinancials}
        emptyText="No admins added. Admins still see this project's material requests assigned to them."
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          size="sm"
          disabled={archived || siteManagerOptions.length === 0}
          onClick={() => setDialog({ role: "site_manager", replace: true })}
        >
          <UserRoundCog aria-hidden="true" />
          {siteManagers.length > 0 ? "Replace site manager" : "Assign site manager"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={archived || adminOptions.length === 0}
          onClick={() => setDialog({ role: "admin", replace: false })}
        >
          <UserPlus aria-hidden="true" />
          Add admin
        </Button>
      </div>
      {archived ? <p className="text-xs text-muted">Restore the project to change its team.</p> : null}

      <AssignDialog
        state={dialog}
        projectId={projectId}
        options={
          dialog?.role === "admin"
            ? adminOptions.filter((o) => !admins.some((a) => a.userId === o.id))
            : siteManagerOptions.filter((o) => !siteManagers.some((s) => s.userId === o.id && s.status === "active" && siteManagers.length === 1))
        }
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function MemberGroup({
  title,
  members,
  toggling,
  archived,
  projectId,
  onToggle,
  onReplace,
  emptyText,
}: {
  title: string;
  members: readonly TeamMemberView[];
  toggling: string | null;
  archived: boolean;
  projectId: string;
  onToggle: (member: TeamMemberView, next: boolean) => void;
  onReplace?: (member: TeamMemberView) => void;
  emptyText?: string;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {members.length === 0 ? (
        <p className="text-sm text-muted">{emptyText ?? "Not assigned."}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-soft">
          {members.map((member) => {
            const switchId = `fin-${member.userId}`;
            return (
              <li key={member.userId} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={member.name} src={member.avatarUrl} colorSeed={member.userId} size="md" decorative />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-text">
                      <span className="truncate">{member.name}</span>
                      {member.status !== "active" ? (
                        <Badge tone="danger" appearance="soft" size="sm">
                          Inactive
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">
                      {MEMBER_ROLE_LABELS[member.memberRole]}
                      {member.employeeId ? ` · ${member.employeeId}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pl-[52px]">
                  <label htmlFor={switchId} className="flex items-center gap-2 text-sm text-text">
                    <Switch
                      id={switchId}
                      checked={member.canViewFinancials}
                      disabled={archived || member.status !== "active" || toggling === member.userId}
                      onCheckedChange={(next) => onToggle(member, next)}
                    />
                    <span className="flex items-center gap-1">
                      <ShieldCheck aria-hidden="true" className="size-3.5 text-primary-strong" />
                      Can view financials
                    </span>
                  </label>
                  <div className="flex items-center gap-1">
                    {onReplace && member.status !== "active" && !archived ? (
                      <Button size="sm" variant="secondary" onClick={() => onReplace(member)}>
                        Reassign
                      </Button>
                    ) : null}
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="ghost" className="text-danger-text hover:bg-danger-bg" aria-label={`Remove ${member.name} from project`}>
                          <UserMinus aria-hidden="true" />
                          Remove
                        </Button>
                      }
                      title={`Remove ${member.name}?`}
                      description={`${member.name} will no longer have ${MEMBER_ROLE_LABELS[member.memberRole].toLowerCase()} access to this project. Their past updates and requests are kept.`}
                      confirmLabel="Remove from project"
                      destructive
                      onConfirm={async () => {
                        const result = await removeProjectMemberAction({ project_id: projectId, user_id: member.userId });
                        if (!result.ok) return { ok: false, error: result.error };
                        toast.success(result.message ?? "Removed.");
                        router.refresh();
                        return { ok: true };
                      }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AssignDialog({
  state,
  projectId,
  options,
  onClose,
  onDone,
}: {
  state: DialogState;
  projectId: string;
  options: readonly PersonOption[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [userId, setUserId] = useState("");
  const [canView, setCanView] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = state !== null;
  const role = state?.role ?? "site_manager";

  function reset() {
    setUserId("");
    setCanView(false);
    setError(null);
  }

  function submit() {
    if (!state) return;
    if (!userId) {
      setError(`Choose a ${MEMBER_ROLE_LABELS[role].toLowerCase()}.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await assignProjectMemberAction({
        project_id: projectId,
        user_id: userId,
        member_role: role,
        can_view_financials: canView,
        replace_existing: state.replace,
      }).catch(() => ({ ok: false as const, error: "We couldn't reach the server. Please try again." }));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(role === "site_manager" ? "Site manager assigned." : "Admin added to the project.");
      reset();
      onDone();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>
            {role === "admin" ? "Add admin" : state?.replacing ? `Reassign from ${state.replacing.name}` : "Assign site manager"}
          </DialogTitle>
          <DialogDescription>
            {role === "admin"
              ? "The admin will see this project and its material requests."
              : "The new site manager replaces any current one and is notified of the assignment."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <FormField label={MEMBER_ROLE_LABELS[role]} required error={error}>
            <Select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder={options.length === 0 ? "No one available" : "Choose…"}
              options={options.map((o) => ({ value: o.id, label: o.label }))}
            />
          </FormField>
          <label className="flex items-start gap-3 text-sm text-text">
            <Checkbox checked={canView} onCheckedChange={(v) => setCanView(v === true)} className="mt-0.5" />
            <span>
              Can view financials
              <span className="block text-xs text-muted">Project cost, payments received and material cost totals.</span>
            </span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button onClick={submit} loading={pending} disabled={options.length === 0}>
            {role === "admin" ? "Add admin" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
