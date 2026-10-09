"use client";

import {
  BadgeCheck,
  Ban,
  CalendarClock,
  ClipboardCheck,
  IndianRupee,
  PackageCheck,
  Pencil,
  ShoppingCart,
  Truck,
  UserCog,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MATERIAL_REQUEST_TRANSITIONS } from "@/lib/constants";
import type { AppRole, MaterialRequestStatus } from "@/types/database";
import { changeRequestStatusAction, markDeliveredAction } from "../actions";
import { ClaimButton } from "./claim-button";
import { useActionRunner } from "./use-action-runner";
import {
  AssignAdminDialog,
  CostsDialog,
  DeliveryDateDialog,
  DeliveryDialog,
  MarkOrderedDialog,
  type AdminOption,
  type WorkflowItem,
} from "./workflow-dialogs";

export type RequestActionsProps = {
  request: {
    id: string;
    request_code: string;
    status: MaterialRequestStatus;
    assigned_admin: string | null;
    requested_by: string;
    expected_delivery_date: string | null;
  };
  viewer: { id: string; role: AppRole };
  /** Items with costs — staff only (empty for site managers). */
  items: readonly WorkflowItem[];
  admins: readonly AdminOption[];
  editHref: string;
};

const DELIVERABLE: readonly MaterialRequestStatus[] = ["approved", "ordered", "partially_delivered"];
const CLOSED: readonly MaterialRequestStatus[] = ["delivered", "rejected", "cancelled"];

function NoteField({ label, value, onChange, required, hint }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Textarea id={id} rows={3} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Role- and status-aware workflow actions (ARCHITECTURE §6 transitions). */
export function RequestActions({ request, viewer, items, admins, editHref }: RequestActionsProps) {
  const run = useActionRunner();
  const [approveNote, setApproveNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const isStaff = viewer.role === "owner" || viewer.role === "admin";
  const isOwner = viewer.role === "owner";
  const isRequester = request.requested_by === viewer.id;
  const status = request.status;
  const allowed = MATERIAL_REQUEST_TRANSITIONS[status];
  const editable = status === "requested" || status === "pending_review";
  const closed = CLOSED.includes(status);

  const canReview = isStaff && allowed.includes("pending_review");
  const canApprove = isStaff && allowed.includes("approved");
  const canReject = isStaff && allowed.includes("rejected");
  const canOrder = isStaff && allowed.includes("ordered");
  const canDeliver = isStaff && DELIVERABLE.includes(status) && items.some((i) => i.quantity > i.delivered_quantity);
  // update_material_request_delivery_date: owner / admin while the order is in flight.
  const canReschedule = isStaff && DELIVERABLE.includes(status);
  const canCosts = isStaff && status !== "rejected" && status !== "cancelled" && items.length > 0;
  const canAssign = isOwner && !closed;
  const canClaim = viewer.role === "admin" && !closed && request.assigned_admin === null;
  const canEdit = editable && (isOwner || (viewer.role === "site_manager" && isRequester));
  const canCancel =
    allowed.includes("cancelled") && (isStaff || (viewer.role === "site_manager" && isRequester && editable));

  const status_ = (target: "pending_review" | "approved" | "rejected" | "cancelled", note?: string) =>
    run(() => changeRequestStatusAction({ request_id: request.id, status: target, note: note ?? "" }));

  const anything =
    canReview || canApprove || canReject || canOrder || canDeliver || canReschedule || canCosts || canAssign || canClaim || canEdit || canCancel;

  if (!anything) {
    return (
      <p className="text-sm text-muted">
        {closed
          ? "This request is closed. Add a comment below if something needs follow-up."
          : viewer.role === "site_manager"
            ? "The admin team is processing this request. You'll be notified when its status changes."
            : "No actions are available for this request right now."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 [&>*]:w-full">
      {canClaim ? <ClaimButton requestId={request.id} requestCode={request.request_code} size="md" variant="primary" /> : null}

      {canApprove ? (
        <ConfirmDialog
          trigger={
            <Button>
              <BadgeCheck aria-hidden="true" />
              Approve
            </Button>
          }
          title={`Approve ${request.request_code}?`}
          description="Estimated unit costs become the approved costs unless you have already set approved costs."
          confirmLabel="Approve"
          onOpenChange={(open) => (open ? setApproveNote("") : undefined)}
          onConfirm={() => status_("approved", approveNote)}
        >
          <NoteField label="Note (optional)" value={approveNote} onChange={setApproveNote} hint="Added to the comments." />
        </ConfirmDialog>
      ) : null}

      {canOrder ? (
        <MarkOrderedDialog
          requestId={request.id}
          defaultExpected={request.expected_delivery_date}
          trigger={
            <Button>
              <ShoppingCart aria-hidden="true" />
              Mark ordered
            </Button>
          }
        />
      ) : null}

      {canDeliver ? (
        <DeliveryDialog
          requestId={request.id}
          items={items}
          trigger={
            <Button variant={canOrder ? "secondary" : "primary"}>
              <Truck aria-hidden="true" />
              Record delivery
            </Button>
          }
        />
      ) : null}

      {canDeliver ? (
        <ConfirmDialog
          trigger={
            <Button variant="secondary">
              <PackageCheck aria-hidden="true" />
              Mark delivered
            </Button>
          }
          title={`Mark ${request.request_code} as fully delivered?`}
          description="All remaining quantities are recorded as delivered today and the request is completed."
          confirmLabel="Mark delivered"
          onConfirm={() => run(() => markDeliveredAction(request.id), "Marked as delivered.")}
        />
      ) : null}

      {canReschedule ? (
        <DeliveryDateDialog
          requestId={request.id}
          current={request.expected_delivery_date}
          trigger={
            <Button variant="outline">
              <CalendarClock aria-hidden="true" />
              Update delivery date
            </Button>
          }
        />
      ) : null}

      {canReview ? (
        <ConfirmDialog
          trigger={
            <Button variant="secondary">
              <ClipboardCheck aria-hidden="true" />
              Mark pending review
            </Button>
          }
          title="Mark as pending review?"
          description="Lets the site team know the request is being reviewed."
          confirmLabel="Mark pending review"
          onConfirm={() => status_("pending_review")}
        />
      ) : null}

      {canCosts ? (
        <CostsDialog
          requestId={request.id}
          items={items}
          trigger={
            <Button variant="outline">
              <IndianRupee aria-hidden="true" />
              Update costs
            </Button>
          }
        />
      ) : null}

      {canAssign ? (
        <AssignAdminDialog
          requestId={request.id}
          currentAdminId={request.assigned_admin}
          admins={admins}
          trigger={
            <Button variant="outline">
              <UserCog aria-hidden="true" />
              {request.assigned_admin ? "Reassign admin" : "Assign admin"}
            </Button>
          }
        />
      ) : null}

      {canEdit ? (
        <Button variant="outline" asChild>
          <Link href={editHref}>
            <Pencil aria-hidden="true" />
            Edit request
          </Link>
        </Button>
      ) : null}

      {canReject ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline" className="text-danger-text hover:border-danger/40 hover:bg-danger-bg">
              <XCircle aria-hidden="true" />
              Reject
            </Button>
          }
          title={`Reject ${request.request_code}?`}
          description="The requester and the owner are notified with your reason."
          confirmLabel="Reject request"
          destructive
          confirmDisabled={rejectReason.trim().length === 0}
          onOpenChange={(open) => (open ? setRejectReason("") : undefined)}
          onConfirm={() => status_("rejected", rejectReason)}
        >
          <NoteField label="Reason" required value={rejectReason} onChange={setRejectReason} />
        </ConfirmDialog>
      ) : null}

      {canCancel ? (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" className="text-danger-text hover:bg-danger-bg">
              <Ban aria-hidden="true" />
              Cancel request
            </Button>
          }
          title={`Cancel ${request.request_code}?`}
          description="Cancelled requests can't be reopened. Raise a new request if the material is needed later."
          confirmLabel="Cancel request"
          cancelLabel="Keep request"
          destructive
          onOpenChange={(open) => (open ? setCancelReason("") : undefined)}
          onConfirm={() => status_("cancelled", cancelReason)}
        >
          <NoteField label="Reason (optional)" value={cancelReason} onChange={setCancelReason} hint="Added to the comments." />
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
