import type { Json } from "@/types/database";

export type ActivityChange = { field: string; before: Json | undefined; after: Json | undefined };

/** Fields that change on every write and add no information. */
const NOISY_KEYS = new Set(["updated_at", "updated_by", "created_at", "id", "last_update_at", "last_updated_by"]);

function isRecord(value: Json | null | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Changed fields between old/new audit snapshots (updates only). */
export function diffChanges(oldData: Json | null, newData: Json | null): ActivityChange[] | null {
  if (!isRecord(oldData) || !isRecord(newData)) return null;
  const keys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)])).filter((k) => !NOISY_KEYS.has(k));
  const changes = keys
    .filter((key) => JSON.stringify(oldData[key] ?? null) !== JSON.stringify(newData[key] ?? null))
    .map((key) => ({ field: key, before: oldData[key], after: newData[key] }));
  return changes.length > 0 ? changes : null;
}
