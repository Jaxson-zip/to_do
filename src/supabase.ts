import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createId } from "./storage";
import type { MemoItem, MemoList } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

const legacyDefaultListIds = new Set([
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
]);

const demoItemTitles = new Set([
  "点击输入框，创建任务",
  "用清单来管理任务",
  "日历：日程安排一目了然",
  "四象限：提升效率利器",
  "番茄专注：拯救拖延症",
  "习惯打卡：见证坚持与成长",
  "看板、时间线视图：可视化管理",
  "桌面便签：随时记录想法",
  "订阅日历：不再错过重要日程",
  "更多特色功能",
]);

type RemoteMemoItem = {
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
  deleted_at: string | null;
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

export async function signInWithPassword(email: string, password: string): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function signUpWithPassword(email: string, password: string): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data.session;
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
  const sanitizedLocal = sanitizeLegacyDefaultListIds(localItems, localLists, remoteItems, remoteLists);
  const mergedLists = mergeListsByNewest(sanitizedLocal.lists, remoteLists);
  const mergedItems = mergeItemsByNewest(sanitizedLocal.items, remoteItems);

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
    supabase.from("memo_items").select("id", { count: "exact", head: true }).eq("user_id", user.id).neq("status", "purged"),
    supabase.from("memo_lists").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("deleted_at", null),
  ]);

  if (itemError) throw itemError;
  if (listError) throw listError;

  return {
    items: itemCount ?? 0,
    lists: listCount ?? 0,
    fetchedAt: new Date().toISOString(),
  };
}

export async function deleteItemFromCloud(itemId: string, userId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("memo_items").delete().eq("user_id", userId).eq("id", itemId);
  if (error) throw error;
}

export async function deleteItemsFromCloud(itemIds: string[], userId: string): Promise<void> {
  if (!supabase || itemIds.length === 0) return;
  const { error } = await supabase.from("memo_items").delete().eq("user_id", userId).in("id", itemIds);
  if (error) throw error;
}

export function mergeItemsByNewest(localItems: MemoItem[], remoteItems: MemoItem[]): MemoItem[] {
  const map = new Map<string, MemoItem>();

  for (const item of [...remoteItems, ...localItems]) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }

    if (existing.status === "purged" && item.status !== "purged") continue;
    if (item.status === "purged" && existing.status !== "purged") {
      map.set(item.id, item);
      continue;
    }

    if (new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      map.set(item.id, item);
    }
  }

  return [...map.values()].sort(sortItems);
}

export function mergeListsByNewest(localLists: MemoList[], remoteLists: MemoList[]): MemoList[] {
  const map = new Map<string, MemoList>();

  for (const list of [...remoteLists, ...localLists]) {
    const existing = map.get(list.id);
    if (!existing) {
      map.set(list.id, list);
      continue;
    }

    if (existing.deletedAt && !list.deletedAt) continue;
    if (list.deletedAt && !existing.deletedAt) {
      map.set(list.id, list);
      continue;
    }

    if (new Date(list.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      map.set(list.id, list);
    }
  }

  return [...map.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function sanitizeLegacyDefaultListIds(
  localItems: MemoItem[],
  localLists: MemoList[],
  remoteItems: MemoItem[],
  remoteLists: MemoList[]
): { items: MemoItem[]; lists: MemoList[] } {
  const remoteIds = new Set(remoteLists.map((list) => list.id));
  const remoteBySeedKey = new Map(
    remoteLists
      .filter((list) => !list.deletedAt)
      .map((list) => [`${list.name}::${list.emoji}`, list.id] as const)
  );
  const replacements = new Map<string, string>();
  const dropLocalListIds = new Set<string>();

  for (const list of localLists) {
    if (!legacyDefaultListIds.has(list.id)) continue;
    const remoteMatchId = remoteBySeedKey.get(`${list.name}::${list.emoji}`);
    if (remoteMatchId) {
      replacements.set(list.id, remoteMatchId);
      dropLocalListIds.add(list.id);
      continue;
    }
    if (remoteIds.has(list.id)) continue;
    replacements.set(list.id, createId());
  }

  const hasRemoteData = remoteLists.some((list) => !list.deletedAt) || remoteItems.some((item) => item.status !== "purged");

  return {
    lists: localLists
      .filter((list) => !dropLocalListIds.has(list.id))
      .map((list) => {
        const nextId = replacements.get(list.id);
        return nextId ? { ...list, id: nextId } : list;
      }),
    items: localItems
      .filter((item) => !(hasRemoteData && demoItemTitles.has(item.title)))
      .map((item) => {
        const nextListId = item.listId ? replacements.get(item.listId) : null;
        return nextListId ? { ...item, listId: nextListId } : item;
      }),
  };
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
    status: item.status === "open" || item.status === "done" || item.status === "purged" ? item.status : "open",
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
    deleted_at: list.deletedAt,
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
    deletedAt: list.deleted_at,
    createdAt: list.created_at,
    updatedAt: list.updated_at,
  };
}
