"use server";

import { revalidatePath } from "next/cache";
import { fail, failFromError, ok, validationFailure, type ActionResult } from "@/lib/action-result";
import { requireRole } from "@/lib/auth";
import { logServerError } from "@/lib/errors";
import { escapeLikePattern } from "@/lib/search-params";
import { createClient } from "@/lib/supabase/server";
import { formDataToObject } from "@/lib/validation/common";
import { categoryIdSchema, categoryNameSchema, companySettingsSchema, moveCategorySchema } from "./schemas";

const NAME_TAKEN = "A category with this name already exists.";

function revalidateSettings() {
  revalidatePath("/settings");
  revalidatePath("/materials");
  revalidatePath("/material-requests/new");
}

/* -------------------------------------------------------------------------- */
/* Company                                                                    */
/* -------------------------------------------------------------------------- */

export async function updateCompanySettingsAction(formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = companySettingsSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.from("company_settings").update(parsed.data).eq("id", 1).select("id");
  if (error) return failFromError(error, "We couldn't save the company details.", "settings.company.update");
  if (!data || data.length === 0) {
    return fail("Company settings are missing from the database. Re-run supabase/setup.sql, then try again.");
  }
  revalidatePath("/", "layout");
  return ok(undefined, "Company details saved.");
}

/* -------------------------------------------------------------------------- */
/* Material categories                                                        */
/* -------------------------------------------------------------------------- */

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function nameTaken(supabase: Supabase, name: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from("material_categories").select("id").ilike("name", escapeLikePattern(name)).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) {
    logServerError("settings.category.nameTaken", error);
    return false;
  }
  return (data ?? []).length > 0;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

export async function createCategoryAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  await requireRole("owner");
  const parsed = categoryNameSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createClient();

  if (await nameTaken(supabase, parsed.data.name)) return fail(NAME_TAKEN, { name: [NAME_TAKEN] });

  const { data: last, error: lastError } = await supabase
    .from("material_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return failFromError(lastError, "We couldn't add the category.", "settings.category.lastOrder");

  const { data, error } = await supabase
    .from("material_categories")
    .insert({ name: parsed.data.name, sort_order: (last?.sort_order ?? 0) + 10, is_active: true })
    .select("id")
    .single();
  if (error) {
    if (isUniqueViolation(error)) return fail(NAME_TAKEN, { name: [NAME_TAKEN] });
    return failFromError(error, "We couldn't add the category.", "settings.category.create");
  }
  revalidateSettings();
  return ok({ id: data.id }, `“${parsed.data.name}” was added.`);
}

export async function renameCategoryAction(
  id: string,
  formData: FormData,
): Promise<ActionResult<{ materialsUpdated: number }>> {
  await requireRole("owner");
  const categoryId = categoryIdSchema.safeParse(id);
  if (!categoryId.success) return fail("We couldn't find that category.");
  const parsed = categoryNameSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationFailure(parsed.error);
  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase
    .from("material_categories")
    .select("name")
    .eq("id", categoryId.data)
    .maybeSingle();
  if (currentError) return failFromError(currentError, "We couldn't rename the category.", "settings.category.load");
  if (!current) return fail("We couldn't find that category.");
  if (current.name === parsed.data.name) return ok({ materialsUpdated: 0 }, "No changes to save.");
  if (await nameTaken(supabase, parsed.data.name, categoryId.data)) return fail(NAME_TAKEN, { name: [NAME_TAKEN] });

  const { error } = await supabase
    .from("material_categories")
    .update({ name: parsed.data.name })
    .eq("id", categoryId.data);
  if (error) {
    if (isUniqueViolation(error)) return fail(NAME_TAKEN, { name: [NAME_TAKEN] });
    return failFromError(error, "We couldn't rename the category.", "settings.category.rename");
  }

  // Keep the material catalog consistent (materials store the category name as text).
  // Past request items keep the name they were requested with.
  const { data: moved, error: moveError } = await supabase
    .from("materials")
    .update({ category: parsed.data.name })
    .eq("category", current.name)
    .select("id");
  revalidateSettings();
  if (moveError) {
    logServerError("settings.category.renameMaterials", moveError);
    return ok(
      { materialsUpdated: 0 },
      `Renamed to “${parsed.data.name}”, but catalog materials still use “${current.name}”. Update them from Materials.`,
    );
  }
  const count = moved?.length ?? 0;
  return ok(
    { materialsUpdated: count },
    count > 0
      ? `Renamed to “${parsed.data.name}” and updated ${count} catalog material${count === 1 ? "" : "s"}.`
      : `Renamed to “${parsed.data.name}”.`,
  );
}

export async function setCategoryActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  await requireRole("owner");
  const categoryId = categoryIdSchema.safeParse(id);
  if (!categoryId.success) return fail("We couldn't find that category.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_categories")
    .update({ is_active: isActive })
    .eq("id", categoryId.data)
    .select("name")
    .maybeSingle();
  if (error) return failFromError(error, "We couldn't update the category.", "settings.category.toggle");
  if (!data) return fail("We couldn't find that category.");
  revalidateSettings();
  return ok(
    undefined,
    isActive ? `“${data.name}” is active again.` : `“${data.name}” was hidden from new materials and requests.`,
  );
}

export async function moveCategoryAction(id: string, direction: "up" | "down"): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = moveCategorySchema.safeParse({ id, direction });
  if (!parsed.success) return fail("Invalid request.");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("material_categories")
    .select("id, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return failFromError(error, "We couldn't reorder the categories.", "settings.category.loadOrder");
  const rows = data ?? [];
  const index = rows.findIndex((row) => row.id === parsed.data.id);
  if (index === -1) return fail("We couldn't find that category.");
  const swapWith = parsed.data.direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= rows.length) return ok();

  const ordered = [...rows];
  const [moved] = ordered.splice(index, 1);
  if (!moved) return ok();
  ordered.splice(swapWith, 0, moved);

  // Renumber 10, 20, 30… and write only rows whose position changed.
  const updates = ordered
    .map((row, position) => ({ id: row.id, sort_order: (position + 1) * 10, previous: row.sort_order }))
    .filter((row) => row.sort_order !== row.previous);
  for (const row of updates) {
    const { error: updateError } = await supabase
      .from("material_categories")
      .update({ sort_order: row.sort_order })
      .eq("id", row.id);
    if (updateError) return failFromError(updateError, "We couldn't reorder the categories.", "settings.category.move");
  }
  revalidateSettings();
  return ok();
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export async function runDeadlineCheckAction(): Promise<ActionResult<{ created: number }>> {
  await requireRole("owner");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_deadline_notifications");
  if (error) return failFromError(error, "We couldn't run the deadline check.", "settings.deadlineCheck");
  const created = typeof data === "number" ? data : 0;
  revalidatePath("/", "layout");
  return ok(
    { created },
    created > 0
      ? `Deadline check finished: ${created} new notification${created === 1 ? "" : "s"} sent.`
      : "Deadline check finished: everyone is already up to date — no new reminders were needed.",
  );
}
