import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BotIntent } from "../../src/bot/intent";
import type { MemoItem } from "../../src/types";

export type MemoItemRow = {
  id: string;
  user_id: string;
  list_id: string | null;
  title: string;
  body: string;
  kind: "task" | "note";
  status: "open" | "done" | "purged";
  priority: "low" | "normal" | "high";
  repeat_rule: "none" | "daily" | "weekly" | "monthly" | null;
  due_date: string | null;
  reminder_at: string | null;
  tags: string[] | null;
  pinned: boolean;
  archived: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BotBindingRow = {
  provider: "clawbot";
  provider_user_id: string;
  user_id: string;
};

export type BindingCodeRow = {
  code: string;
  user_id: string;
  expires_at: string;
  used_at: string | null;
};

export function memoItemFromRow(row: MemoItemRow): MemoItem {
  return {
    id: row.id,
    listId: row.list_id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    status: row.status,
    priority: row.priority,
    repeatRule:
      row.repeat_rule === "daily" || row.repeat_rule === "weekly" || row.repeat_rule === "monthly"
        ? row.repeat_rule
        : "none",
    dueDate: row.due_date,
    reminderAt: row.reminder_at,
    tags: row.tags ?? [],
    pinned: row.pinned,
    archived: row.archived,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createTaskFromIntent(
  supabase: SupabaseClient,
  userId: string,
  intent: Extract<BotIntent, { type: "createTask" }>
): Promise<MemoItem> {
  const createdAt = new Date().toISOString();
  const body = intent.eventAt && intent.reminderAt && intent.eventAt !== intent.reminderAt ? `原定时间：${intent.eventAt}` : "";
  const payload: MemoItemRow = {
    id: randomUUID(),
    user_id: userId,
    list_id: null,
    title: intent.title,
    body,
    kind: "task",
    status: "open",
    priority: "normal",
    repeat_rule: "none",
    due_date: intent.dueDate,
    reminder_at: intent.reminderAt,
    tags: ["wechat"],
    pinned: false,
    archived: false,
    deleted_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const { data, error } = await supabase.from("memo_items").insert(payload).select("*").single();
  if (error) throw error;
  return memoItemFromRow(data as MemoItemRow);
}

export async function fetchOpenTasks(supabase: SupabaseClient, userId: string, limit = 100): Promise<MemoItem[]> {
  const { data, error } = await supabase
    .from("memo_items")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", "task")
    .eq("status", "open")
    .eq("archived", false)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as MemoItemRow[]).map(memoItemFromRow);
}

export async function getBotBinding(supabase: SupabaseClient, providerUserId: string): Promise<BotBindingRow | null> {
  const { data, error } = await supabase
    .from("bot_bindings")
    .select("provider, provider_user_id, user_id")
    .eq("provider", "clawbot")
    .eq("provider_user_id", providerUserId)
    .maybeSingle();

  if (error) throw error;
  return (data as BotBindingRow | null) ?? null;
}

export async function bindProviderUser(
  supabase: SupabaseClient,
  providerUserId: string,
  code: string
): Promise<"bound" | "invalid"> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("bot_binding_codes")
    .select("code, user_id, expires_at, used_at")
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) throw error;
  const bindingCode = data as BindingCodeRow | null;
  if (!bindingCode) return "invalid";

  await supabase.from("bot_bindings").delete().eq("provider", "clawbot").eq("provider_user_id", providerUserId);
  await supabase.from("bot_bindings").delete().eq("provider", "clawbot").eq("user_id", bindingCode.user_id);

  const { error: insertError } = await supabase.from("bot_bindings").insert({
    provider: "clawbot",
    provider_user_id: providerUserId,
    user_id: bindingCode.user_id,
  });
  if (insertError) throw insertError;

  const { error: updateError } = await supabase.from("bot_binding_codes").update({ used_at: now }).eq("code", code);
  if (updateError) throw updateError;

  return "bound";
}

export async function markTaskDone(supabase: SupabaseClient, userId: string, itemId: string): Promise<void> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("memo_items")
    .update({ status: "done", updated_at: updatedAt })
    .eq("user_id", userId)
    .eq("id", itemId);
  if (error) throw error;
}

export async function softDeleteTask(supabase: SupabaseClient, userId: string, itemId: string): Promise<void> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("memo_items")
    .update({ deleted_at: updatedAt, archived: false, updated_at: updatedAt })
    .eq("user_id", userId)
    .eq("id", itemId);
  if (error) throw error;
}

export async function snoozeMostRecentReminder(
  supabase: SupabaseClient,
  userId: string,
  providerUserId: string,
  minutes: number
): Promise<MemoItem | null> {
  const { data, error } = await supabase
    .from("bot_reminder_events")
    .select("id, item_id")
    .eq("provider", "clawbot")
    .eq("provider_user_id", providerUserId)
    .eq("user_id", userId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const reminder = data as { id: string; item_id: string } | null;
  if (!reminder) return null;

  const reminderAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const updatedAt = new Date().toISOString();

  const { data: updated, error: updateItemError } = await supabase
    .from("memo_items")
    .update({ reminder_at: reminderAt, updated_at: updatedAt })
    .eq("user_id", userId)
    .eq("id", reminder.item_id)
    .select("*")
    .single();
  if (updateItemError) throw updateItemError;

  const { error: updateReminderError } = await supabase
    .from("bot_reminder_events")
    .update({ snoozed_until: reminderAt })
    .eq("id", reminder.id);
  if (updateReminderError) throw updateReminderError;

  return memoItemFromRow(updated as MemoItemRow);
}

