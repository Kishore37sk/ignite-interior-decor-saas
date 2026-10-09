import type { AppRole, Json } from "@/types/database";

/**
 * One row of the `activity_feed` view. Mirrors supabase/migrations/0006 exactly
 * (the view has project_code/project_name and NO old_data/new_data columns).
 */
export type ActivityFeedEntry = {
  id: string;
  user_id: string | null;
  actor_name: string | null;
  role: AppRole | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  project_id: string | null;
  summary: string | null;
  metadata: Json | null;
  project_code: string | null;
  project_name: string | null;
  created_at: string;
};

/** Audited tables (audit_row_change trigger list) with display labels. */
export const ACTIVITY_ENTITY_LABELS: Record<string, string> = {
  projects: "Project",
  project_updates: "Progress Update",
  project_milestones: "Milestone",
  project_members: "Team Assignment",
  project_documents: "Document",
  project_financials: "Financials",
  clients: "Client",
  material_requests: "Material Request",
  material_request_items: "Material Item",
  material_deliveries: "Delivery",
  materials: "Material Catalog",
  material_categories: "Material Category",
  company_settings: "Company Settings",
  profiles: "User",
};

/** Entity types offered in the filter, per role (non-owners never see financials/clients/settings rows). */
export function entityTypesForRole(role: AppRole): string[] {
  if (role === "owner") return Object.keys(ACTIVITY_ENTITY_LABELS);
  return [
    "projects",
    "project_updates",
    "project_milestones",
    "project_members",
    "project_documents",
    "material_requests",
    "material_request_items",
    "material_deliveries",
    "materials",
    "profiles",
  ];
}

export function entityLabel(entityType: string): string {
  return ACTIVITY_ENTITY_LABELS[entityType] ?? entityType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function metaString(metadata: Json | null, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, Json | undefined>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

const PROJECT_TABS: Record<string, string> = {
  project_updates: "updates",
  project_milestones: "timeline",
  project_documents: "documents",
};

/** Deep link for an activity row, respecting which pages the viewer's role may open. */
export function activityHref(entry: Pick<ActivityFeedEntry, "entity_type" | "entity_id" | "project_id" | "metadata" | "action">, role: AppRole): string | null {
  const { entity_type: type, entity_id: id, project_id: projectId } = entry;
  if (entry.action === "delete" && type === "projects") return null;
  switch (type) {
    case "projects":
      return id ? `/projects/${id}` : null;
    case "project_updates":
    case "project_milestones":
    case "project_documents":
    case "project_members":
      return projectId ? `/projects/${projectId}${PROJECT_TABS[type] ? `?tab=${PROJECT_TABS[type]}` : ""}` : null;
    case "project_financials":
      return role === "owner" && projectId ? `/projects/${projectId}` : null;
    case "material_requests":
      return id ? `/material-requests/${id}` : null;
    case "material_request_items":
    case "material_deliveries": {
      const requestId = metaString(entry.metadata, "request_id");
      return requestId ? `/material-requests/${requestId}` : null;
    }
    case "clients":
      return role !== "admin" && id ? `/clients/${id}` : null;
    case "materials":
      return "/materials";
    case "material_categories":
    case "company_settings":
      return role === "owner" ? "/settings" : null;
    default:
      return null;
  }
}

export function requestCode(metadata: Json | null): string | null {
  return metaString(metadata, "request_code");
}
