import "server-only";
import { toFriendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { CompanySettings, MaterialCategory } from "@/types/database";

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("company_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(toFriendlyError(error, "We couldn't load company settings.", "settings.company"));
  return data;
}

export async function listMaterialCategories(): Promise<MaterialCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(toFriendlyError(error, "We couldn't load material categories.", "settings.categories"));
  return data ?? [];
}

/** Number of catalog materials per category name (to warn before renames/deactivation). */
export async function countMaterialsByCategory(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("materials").select("category").not("category", "is", null);
  if (error) throw new Error(toFriendlyError(error, "We couldn't load the material catalog.", "settings.materialCounts"));
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.category) counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  return counts;
}
