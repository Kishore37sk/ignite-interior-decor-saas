"use client";

import { FolderKanban, KeyRound, MoreHorizontal, Pencil, Power, PowerOff, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setUserStatusAction } from "../actions";
import { AssignProjectsDialog } from "./assign-projects-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import { PasswordLinkDialog } from "./password-link-dialog";
import { profileHref, type ManagedUser } from "./types";

type DialogName = "edit" | "password" | "assign" | "status" | null;

export type UserActionsProps = {
  user: ManagedUser;
  /** The signed-in owner's id (no self status changes). */
  currentUserId: string;
  /** `menu`: compact ⋯ menu for table rows; `toolbar`: buttons for detail pages. */
  layout?: "menu" | "toolbar";
  /** Show a "View profile" item (list pages). */
  showProfileLink?: boolean;
};

/** Owner actions for a staff user: edit, password link, assign projects, activate/deactivate. */
export function UserActions({ user, currentUserId, layout = "menu", showProfileLink = false }: UserActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogName>(null);

  if (user.role === "owner" || user.id === currentUserId) {
    return layout === "menu" ? (
      <span className="text-xs text-muted" title="The owner account is managed from its own profile.">
        Read-only
      </span>
    ) : null;
  }

  const isStaff = user.role === "admin" || user.role === "site_manager";
  const active = user.status === "active";
  const href = profileHref(user);
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  async function toggleStatus() {
    const res = await setUserStatusAction(user.id, active ? "inactive" : "active");
    if (!res.ok) return res;
    if (res.data.authSynced) toast.success(res.message ?? "Status updated.");
    else toast.warning(res.message ?? "Status updated with a warning.");
    router.refresh();
    return res;
  }

  const menuItems = (
    <>
      {showProfileLink && href ? (
        <DropdownMenuItem asChild>
          <Link href={href}>
            <UserRound aria-hidden="true" />
            View profile
          </Link>
        </DropdownMenuItem>
      ) : null}
      {layout === "menu" ? (
        <DropdownMenuItem onSelect={() => setDialog("edit")}>
          <Pencil aria-hidden="true" />
          Edit details
        </DropdownMenuItem>
      ) : null}
      {layout === "menu" && isStaff ? (
        <DropdownMenuItem onSelect={() => setDialog("assign")}>
          <FolderKanban aria-hidden="true" />
          Assign projects
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={() => setDialog("password")} disabled={!active}>
        <KeyRound aria-hidden="true" />
        {active ? "Send password link" : "Send password link (activate first)"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem destructive={active} onSelect={() => setDialog("status")}>
        {active ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
        {active ? "Deactivate" : "Activate"}
      </DropdownMenuItem>
    </>
  );

  return (
    <>
      {layout === "menu" ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.full_name}`}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>{menuItems}</DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setDialog("edit")}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
          {isStaff ? (
            <Button variant="secondary" onClick={() => setDialog("assign")}>
              <FolderKanban aria-hidden="true" />
              Assign projects
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label={`More actions for ${user.full_name}`}>
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>{menuItems}</DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <EditUserDialog user={user} open={dialog === "edit"} onOpenChange={close} />
      <PasswordLinkDialog user={user} open={dialog === "password"} onOpenChange={close} />
      {isStaff ? <AssignProjectsDialog user={user} open={dialog === "assign"} onOpenChange={close} /> : null}
      <ConfirmDialog
        open={dialog === "status"}
        onOpenChange={close}
        destructive={active}
        title={active ? `Deactivate ${user.full_name}?` : `Activate ${user.full_name}?`}
        description={
          active
            ? "They will be signed out and can no longer log in. Their project assignments, updates, material requests and activity history are kept — nothing is deleted. You can reassign their projects afterwards."
            : "They will be able to sign in again with their existing password (or a new password link) and see their assigned projects."
        }
        confirmLabel={active ? "Deactivate" : "Activate"}
        onConfirm={toggleStatus}
      />
    </>
  );
}
