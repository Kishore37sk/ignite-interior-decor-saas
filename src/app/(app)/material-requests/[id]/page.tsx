import {
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  ClipboardList,
  FolderKanban,
  MessageSquare,
  NotebookPen,
  PackageOpen,
  Truck,
  UserRound,
  UserRoundCog,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityTimeline } from "@/components/shared/activity-timeline";
import { CurrencyText } from "@/components/shared/currency-text";
import { InfoList, InfoRow } from "@/components/shared/info-row";
import { PageHeader } from "@/components/shared/page-header";
import { PriorityBadge } from "@/components/shared/priority-badge";
import { ProgressBar } from "@/components/shared/progress-bar";
import { RequiredDateBadge } from "@/components/shared/required-date-badge";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableCaption, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireRole, type CurrentUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, relativeTime } from "@/lib/dates";
import { formatQuantity } from "@/lib/format";
import { getParam, type SearchParamsRecord } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { uuid } from "@/lib/validation/common";
import { CommentForm } from "@/features/materials/components/comment-form";
import { RequestActions } from "@/features/materials/components/request-actions";
import { RequestForm } from "@/features/materials/components/request-form";
import { RequestRealtime } from "@/features/materials/components/request-realtime";
import { StatusStepper } from "@/features/materials/components/status-stepper";
import {
  getRequestDetail,
  listActiveCatalog,
  listCategoryNames,
  listPeople,
  type RequestDetail,
} from "@/features/materials/queries";
import type { MaterialRequestItem } from "@/types/database";

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<SearchParamsRecord> };

export const metadata: Metadata = { title: "Material Request" };

const n = (value: number | null | undefined) => (value === null || value === undefined ? null : Number(value));
const lineTotal = (qty: number, unit: number | null | undefined) => (n(unit) === null ? null : qty * (n(unit) ?? 0));

export default async function MaterialRequestPage({ params, searchParams }: PageProps) {
  const user = await requireRole("owner", "admin", "site_manager");
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  const id = uuid.safeParse(rawId);
  if (!id.success) notFound();

  const detail = await getRequestDetail(id.data);
  if (!detail) notFound();
  const { request } = detail;

  const isStaff = user.role === "owner" || user.role === "admin";
  const editable = request.status === "requested" || request.status === "pending_review";
  const canEdit =
    editable && (user.role === "owner" || (user.role === "site_manager" && request.requested_by === user.id));
  const editHref = `/material-requests/${request.id}?edit=1`;

  if (getParam(query, "edit") === "1" && canEdit) {
    const [catalog, categories] = await Promise.all([listActiveCatalog(), listCategoryNames()]);
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <PageHeader
          back={{ href: `/material-requests/${request.id}`, label: `Back to ${request.request_code}` }}
          title={`Edit ${request.request_code}`}
          description="Requests can be edited until they are approved. Saving replaces the item list."
        />
        <RequestForm
          mode="edit"
          requestId={request.id}
          projectLabel={`${request.project_name} (${request.project_code})${request.client_name ? ` · ${request.client_name}` : ""}`}
          catalog={catalog}
          categories={categories}
          cancelHref={`/material-requests/${request.id}`}
          initial={{
            title: request.title,
            required_date: request.required_date,
            priority: request.priority,
            notes: request.notes,
            items: detail.items.map((item) => ({
              material_id: item.material_id,
              material_name: item.material_name,
              category: item.category,
              quantity: Number(item.quantity),
              unit: item.unit,
              estimated_unit_cost: n(item.estimated_unit_cost),
              notes: item.notes,
            })),
          }}
        />
      </div>
    );
  }

  const admins = user.role === "owner" ? await listPeople("admin") : [];

  return (
    <div className="flex flex-col gap-6">
      <RequestRealtime requestId={request.id} />
      <PageHeader
        back={{ href: "/material-requests", label: "Material requests" }}
        title={request.title}
        meta={
          <>
            <Badge tone="outline">{request.request_code}</Badge>
            <StatusBadge kind="material" value={request.status} />
            <PriorityBadge value={request.priority} />
            <RequiredDateBadge requiredDate={request.required_date} status={request.status} />
          </>
        }
        description={
          <>
            {request.project_name} · {request.project_code}
            {request.items_summary ? ` — ${request.items_summary}` : ""}
          </>
        }
      />

      <SectionCard title="Progress" as="h2">
        <StatusStepper request={request} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <ItemsSection detail={detail} showAllCosts={isStaff} />
          <DeliveriesSection detail={detail} />
          <SectionCard
            title="Comments"
            description="Notes between the site and the admin team."
            id="comments"
          >
            <div className="flex flex-col gap-5">
              {detail.comments.length === 0 ? (
                <EmptyState compact icon={MessageSquare} title="No comments yet" description="Ask a question or share a delivery update." />
              ) : (
                <ol className="flex flex-col gap-4">
                  {detail.comments.map((comment) => (
                    <li key={comment.id} className="flex flex-col gap-2 rounded-2xl bg-surface-muted p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <UserAvatar
                          name={comment.authorName}
                          userId={comment.author_id}
                          size="sm"
                          subtitle={comment.authorRole ? ROLE_LABELS[comment.authorRole] : undefined}
                        />
                        <time dateTime={comment.created_at} title={formatDateTime(comment.created_at)} className="text-xs text-muted">
                          {relativeTime(comment.created_at)}
                        </time>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm text-text">{comment.body}</p>
                    </li>
                  ))}
                </ol>
              )}
              <CommentForm requestId={request.id} />
            </div>
          </SectionCard>
          <SectionCard title="Activity" description="Every change to this request, newest first.">
            <ActivityTimeline items={detail.activity} showEntity={false} emptyDescription="Changes to this request will appear here." />
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <SectionCard title="Actions">
            <RequestActions
              request={{
                id: request.id,
                request_code: request.request_code,
                status: request.status,
                assigned_admin: request.assigned_admin,
                requested_by: request.requested_by,
                expected_delivery_date: request.expected_delivery_date,
              }}
              viewer={{ id: user.id, role: user.role }}
              items={
                isStaff
                  ? detail.items.map((item) => ({
                      id: item.id,
                      material_name: item.material_name,
                      unit: item.unit,
                      quantity: Number(item.quantity),
                      delivered_quantity: Number(item.delivered_quantity),
                      estimated_unit_cost: n(item.estimated_unit_cost),
                      approved_unit_cost: n(item.approved_unit_cost),
                      actual_unit_cost: n(item.actual_unit_cost),
                    }))
                  : []
              }
              admins={admins}
              editHref={editHref}
            />
          </SectionCard>
          <CostSummary detail={detail} user={user} />
          <SectionCard title="Details">
            <InfoList>
              <InfoRow
                icon={FolderKanban}
                label="Project"
                value={
                  <Link href={`/projects/${request.project_id}`} className="text-primary-strong hover:underline">
                    {request.project_name} ({request.project_code})
                  </Link>
                }
              />
              <InfoRow icon={UserRound} label="Client" value={request.client_name} />
              <InfoRow icon={UserRound} label="Requested by" value={request.requested_by_name} />
              <InfoRow
                icon={UserRoundCog}
                label="Assigned admin"
                value={request.assigned_admin_name ?? <span className="text-warning-text">Unassigned</span>}
              />
              <InfoRow icon={CalendarClock} label="Required date" value={formatDate(request.required_date)} />
              <InfoRow icon={CalendarPlus} label="Requested on" value={formatDateTime(request.requested_at)} />
              <InfoRow icon={Truck} label="Expected delivery" value={request.expected_delivery_date ? formatDate(request.expected_delivery_date) : null} fallback="Not set" />
              <InfoRow icon={CalendarCheck} label="Delivery date" value={request.delivery_date ? formatDate(request.delivery_date) : null} fallback="Not delivered yet" />
              {request.rejection_reason ? <InfoRow icon={ClipboardList} label="Rejection reason" value={request.rejection_reason} /> : null}
              <InfoRow icon={NotebookPen} label="Notes" value={request.notes ? <span className="whitespace-pre-wrap">{request.notes}</span> : null} fallback="No notes" />
            </InfoList>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DeliveredCell({ item }: { item: MaterialRequestItem }) {
  const qty = Number(item.quantity);
  const delivered = Number(item.delivered_quantity);
  const pct = qty > 0 ? (delivered / qty) * 100 : 0;
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <span className="text-sm tabular-nums text-text">{formatQuantity(delivered, item.unit)}</span>
      <ProgressBar value={pct} label={`${item.material_name} delivered`} size="sm" showValue={false} tone={pct >= 100 ? "deep" : "primary"} />
    </div>
  );
}

function CostPair({ unit, qty }: { unit: number | null; qty: number }) {
  if (unit === null) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-col items-end">
      <CurrencyText value={lineTotal(qty, unit)} className="font-medium text-text" />
      <span className="text-xs text-muted">
        <CurrencyText value={unit} /> / unit
      </span>
    </div>
  );
}

function ItemsSection({ detail, showAllCosts }: { detail: RequestDetail; showAllCosts: boolean }) {
  const { items } = detail;
  return (
    <SectionCard title="Requested items" description={`${items.length} ${items.length === 1 ? "item" : "items"}`}>
      {items.length === 0 ? (
        <EmptyState compact icon={PackageOpen} title="No items" description="This request has no items." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableCaption>Requested items</TableCaption>
              <THead>
                <tr>
                  <TH>Material</TH>
                  <TH align="right">Quantity</TH>
                  <TH>Delivered</TH>
                  <TH align="right">Estimated</TH>
                  {showAllCosts ? <TH align="right">Approved</TH> : null}
                  {showAllCosts ? <TH align="right">Actual</TH> : null}
                </tr>
              </THead>
              <TBody>
                {items.map((item) => {
                  const qty = Number(item.quantity);
                  const est = n(item.estimated_unit_cost);
                  const act = n(item.actual_unit_cost);
                  return (
                    <TR key={item.id}>
                      <TD>
                        <div className="flex min-w-0 max-w-64 flex-col">
                          <span className="font-medium text-text">{item.material_name}</span>
                          <span className="text-xs text-muted">{[item.category, item.notes].filter(Boolean).join(" · ") || "—"}</span>
                        </div>
                      </TD>
                      <TD align="right" className="tabular-nums">
                        {formatQuantity(qty, item.unit)}
                      </TD>
                      <TD>
                        <DeliveredCell item={item} />
                      </TD>
                      <TD align="right">
                        <CostPair unit={est} qty={qty} />
                      </TD>
                      {showAllCosts ? (
                        <TD align="right">
                          <CostPair unit={n(item.approved_unit_cost)} qty={qty} />
                        </TD>
                      ) : null}
                      {showAllCosts ? (
                        <TD align="right" className={cn(act !== null && est !== null && act > est && "[&_span]:text-danger-text")}>
                          <CostPair unit={act} qty={qty} />
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
          <ul className="flex flex-col divide-y divide-border-soft md:hidden" aria-label="Requested items">
            {items.map((item) => {
              const qty = Number(item.quantity);
              return (
                <li key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-text">{item.material_name}</p>
                      <p className="text-xs text-muted">{[item.category, item.notes].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-text">{formatQuantity(qty, item.unit)}</span>
                  </div>
                  <DeliveredCell item={item} />
                  <dl className={cn("grid gap-3 text-sm", showAllCosts ? "grid-cols-3" : "grid-cols-1")}>
                    <div>
                      <dt className="text-xs text-muted">Estimated</dt>
                      <dd>
                        <CurrencyText value={lineTotal(qty, n(item.estimated_unit_cost))} />
                      </dd>
                    </div>
                    {showAllCosts ? (
                      <>
                        <div>
                          <dt className="text-xs text-muted">Approved</dt>
                          <dd>
                            <CurrencyText value={lineTotal(qty, n(item.approved_unit_cost))} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Actual</dt>
                          <dd>
                            <CurrencyText value={lineTotal(qty, n(item.actual_unit_cost))} />
                          </dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

function CostSummary({ detail, user }: { detail: RequestDetail; user: CurrentUser }) {
  const { request } = detail;
  const estimated = n(request.estimated_cost);
  const approved = n(request.approved_cost);
  const actual = n(request.actual_cost);
  // Like-for-like (cost_variance): actual − estimate over the items that have an actual cost,
  // so lines still awaiting a bill don't hide an overrun.
  const variance = actual !== null ? n(request.cost_variance) : null;
  const overrun = variance !== null && variance > 0;

  if (user.role === "site_manager") {
    return (
      <SectionCard title="Estimated cost">
        <p className="text-2xl font-semibold tabular-nums text-text">
          <CurrencyText value={estimated} fallback="Not estimated" />
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Cost summary" description="Variance = actual − estimated, over the items that have an actual cost.">
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-xs text-muted">Estimated</dt>
          <dd className="text-lg font-semibold text-text">
            <CurrencyText value={estimated} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Approved</dt>
          <dd className="text-lg font-semibold text-text">
            <CurrencyText value={approved} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Actual</dt>
          <dd className={cn("text-lg font-semibold", overrun ? "text-danger-text" : "text-text")}>
            <CurrencyText value={actual} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Variance</dt>
          <dd className={cn("text-lg font-semibold", overrun ? "text-danger-text" : "text-text")}>
            {variance === null ? (
              <span className="text-muted">—</span>
            ) : (
              <>
                {variance > 0 ? "+" : ""}
                <CurrencyText value={variance} className={overrun ? "text-danger-text" : variance < 0 ? "text-success-text" : undefined} />
              </>
            )}
          </dd>
        </div>
      </dl>
      {overrun ? (
        <p role="note" className="mt-4 rounded-xl bg-danger-bg px-3 py-2 text-sm font-medium text-danger-text">
          Cost overrun: actual cost is above the estimate.
        </p>
      ) : null}
    </SectionCard>
  );
}

function DeliveriesSection({ detail }: { detail: RequestDetail }) {
  if (detail.deliveries.length === 0) {
    return (
      <SectionCard title="Deliveries">
        <EmptyState compact icon={Truck} title="No deliveries recorded" description="Deliveries appear here as materials arrive on site." />
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Deliveries" description={`${detail.deliveries.length} recorded`}>
      <ol className="flex flex-col divide-y divide-border-soft">
        {detail.deliveries.map((d) => (
          <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">
                {d.itemName} · <span className="tabular-nums">{formatQuantity(Number(d.delivered_quantity), d.unit)}</span>
              </p>
              <p className="text-xs text-muted">Recorded by {d.recordedByName}</p>
              {d.notes ? <p className="mt-1 break-words text-xs text-muted">{d.notes}</p> : null}
            </div>
            <time dateTime={d.delivery_date} className="shrink-0 text-sm tabular-nums text-text">
              {formatDate(d.delivery_date)}
            </time>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}
