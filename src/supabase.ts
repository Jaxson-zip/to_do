import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { MemoItem, MemoList } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

type RemoteMemoItem = {
  id: string;
  user_id: string;
  list_id: string | null;
  title: string;
  body: string;
  kind: "task" | "note";
  status: "open" | "done";
  priority: "low" | "normal" | "high";
  repeat_rule: "none" | "daily" | "weekly" | "monthly" | null;
  due_date: string | null;
  reminder_at: string | null;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type RemoteMemoList = {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type CloudStats = {
  items: number;
  lists: number;
  fetchedAt: string;
};

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthChange(callback: (session: Session | null) => void): () => void {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithEmail(email: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  });
  if (error) throw error;
}

export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function syncWithCloud(
  localItems: MemoItem[],
  localLists: MemoList[],
  user: User
): Promise<{ items: MemoItem[]; lists: MemoList[] }> {
  if (!supabase) return { items: localItems, lists: localLists };

  const [{ data: itemData, error: itemError }, { data: listData, error: listError }] = await Promise.all([
    supabase.from("memo_items").select("*").eq("user_id", user.id),
    supabase.from("memo_lists").select("*").eq("user_id", user.id),
  ]);

  if (itemError) throw itemError;
  if (listError) throw listError;

  const remoteItems = ((itemData ?? []) as RemoteMemoItem[]).map(itemFromRemote);
  const remoteLists = ((listData ?? []) as RemoteMemoList[]).map(listFromRemote);
  const mergedLists = mergeListsByNewest(localLists, remoteLists);
  const mergedItems = mergeItemsByNewest(localItems, remoteItems);

  const listPayload = mergedLists.map((list) => listToRemote(list, user.id));
  const itemPayload = mergedItems.map((item) => itemToRemote(item, user.id));

  if (listPayload.length > 0) {
    const { error: upsertListError } = await supabase.from("memo_lists").upsert(listPayload, { onConflict: "id" });
    if (upsertListError) throw upsertListError;
  }

  if (itemPayload.length > 0) {
    const { error: upsertItemError } = await supabase.from("memo_items").upsert(itemPayload, { onConflict: "id" });
    if (upsertItemError) throw upsertItemError;
  }

  return { items: mergedItems, lists: mergedLists };
}

export async function fetchCloudStats(user: User): Promise<CloudStats> {
  if (!supabase) return { items: 0, lists: 0, fetchedAt: new Date().toISOString() };

  const [{ count: itemCount, error: itemError }, { count: listCount, error: listError }] = await Promise.all([
    supabase.from("memo_items").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("memo_lists").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);

  if (itemError) throw itemError;
  if (listError) throw listError;

  return {
    items: itemCount ?? 0,
    lists: listCount ?? 0,
    fetchedAt: new Date().toISOString(),
  };
}

function mergeItemsByNewest(localItems: MemoItem[], remoteItems: MemoItem[]): MemoItem[] {
  const map = new Map<string, MemoItem>();

  for (const item of [...remoteItems, ...localItems]) {
    const existing = map.get(item.id);
    if (!existing || new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      map.set(item.id, item);
    }
  }

  return [...map.values()].sort(sortItems);
}

function mergeListsByNewest(localLists: MemoList[], remoteLists: MemoList[]): MemoList[] {
  const map = new Map<string, MemoList>();

  for (const list of [...remoteLists, ...localLists]) {
    const existing = map.get(list.id);
    if (!existing || new Date(list.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      map.set(list.id, list);
    }
  }

  return [...map.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function sortItems(a: MemoItem, b: MemoItem): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  if (a.status !== b.status) return a.status === "open" ? -1 : 1;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function itemToRemote(item: MemoItem, userId: string): RemoteMemoItem {
  return {
    id: item.id,
    user_id: userId,
    list_id: item.listId,
    title: item.title,
    body: item.body,
    kind: item.kind,
    status: item.status,
    priority: item.priority,
    repeat_rule: item.repeatRule,
    due_date: item.dueDate,
    reminder_at: item.reminderAt,
    tags: item.tags,
    pinned: item.pinned,
    archived: item.archived,
    deleted_at: item.deletedAt,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function itemFromRemote(item: RemoteMemoItem): MemoItem {
  return {
    id: item.id,
    listId: item.list_id,
    title: item.title,
    body: item.body,
    kind: item.kind,
    status: item.status,
    priority: item.priority,
    repeatRule:
      item.repeat_rule === "daily" || item.repeat_rule === "weekly" || item.repeat_rule === "monthly"
        ? item.repeat_rule
        : "none",
    dueDate: item.due_date,
    reminderAt: item.reminder_at,
    tags: item.tags ?? [],
    pinned: item.pinned,
    archived: item.archived,
    deletedAt: item.deleted_at,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function listToRemote(list: MemoList, userId: string): RemoteMemoList {
  return {
    id: list.id,
    user_id: userId,
    name: list.name,
    emoji: list.emoji,
    archived: list.archived,
    created_at: list.createdAt,
    updated_at: list.updatedAt,
  };
}

function listFromRemote(list: RemoteMemoList): MemoList {
  return {
    id: list.id,
    name: list.name,
    emoji: list.emoji,
    archived: list.archived,
    createdAt: list.created_at,
    updatedAt: list.updated_at,
  };
}
