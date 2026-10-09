import type { ActivityItem } from "@/components/shared/activity-timeline";
import type { AppRole, Json } from "@/types/database";
import type { ActivityRow } from "./types";

function metaString(metadata: Json | null, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Best in-app link for an audit row that the viewer's role can open (or null). */
export function activityHref(row: ActivityRow, role: AppRole): string | null {
  const requestId = metaString(row.metadata, "request_id");
  switch (row.entity_type) {
    case "material_requests":
      return row.entity_id ? `/material-requests/${row.entity_id}` : null;
    case "material_request_items":
    case "material_deliveries":
    case "material_request_comments":
      if (requestId) return `/material-requests/${requestId}`;
      break;
    case "projects":
      if (row.entity_id) return `/projects/${row.entity_id}`;
      break;
    case "project_updates":
      if (row.project_id) return `/projects/${row.project_id}?tab=updates`;
      break;
    case "project_milestones":
      if (row.project_id) return `/projects/${row.project_id}?tab=timeline`;
      break;
    case "project_documents":
      if (row.project_id) return `/projects/${row.project_id}?tab=documents`;
      break;
    case "clients":
      return role !== "admin" && row.entity_id ? `/clients/${row.entity_id}` : null;
    case "materials":
    case "material_categories":
      return "/materials";
    default:
      break;
  }
  return row.project_id ? `/projects/${row.project_id}` : null;
}

export function toActivityItems(rows: readonly ActivityRow[], role: AppRole): ActivityItem[] {
  return rows.map((row) => ({
    id: row.id,
    actorId: row.user_id,
    actorName: row.actor_name,
    summary: row.summary ?? "Made a change",
    createdAt: row.created_at,
    entityType: row.entity_type,
    href: activityHref(row, role),
  }));
}
