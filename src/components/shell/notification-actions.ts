"use server";

import { z } from "zod";
import { fail, failFromError, ok, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";

const idSchema = z.object({ id: uuid });

/** Mark one of the current user's notifications as read (RLS limits to own rows). */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) return fail("Notification not found.");

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", parsed.data.id)
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) throw error;
    return ok();
  } catch (err) {
    return failFromError(err, "Unable to update the notification.", "notifications.markRead");
  }
}

/** Mark all of the current user's notifications as read. */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  await requireUser();
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("mark_all_notifications_read");
    if (error) throw error;
    return ok();
  } catch (err) {
    return failFromError(err, "Unable to update notifications.", "notifications.markAllRead");
  }
}
