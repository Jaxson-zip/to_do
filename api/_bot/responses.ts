import type { MemoItem } from "./types";

export function formatCreatedTaskReply(item: Pick<MemoItem, "title" | "dueDate" | "reminderAt">): string {
  const lines = [`已记录：${item.title}`];
  if (item.dueDate) lines.push(`日期：${item.dueDate}`);
  if (item.reminderAt) lines.push(`提醒：${formatDateTime(item.reminderAt)}`);
  return lines.join("\n");
}

export function formatTaskListReply(items: MemoItem[], emptyText: string): string {
  if (items.length === 0) return emptyText;
  return items.map((item, index) => `${index + 1}. ${formatTaskLine(item)}`).join("\n");
}

export function formatTaskLine(item: MemoItem): string {
  const when = item.reminderAt ? formatDateTime(item.reminderAt) : item.dueDate ?? "无日期";
  return `${when} ${item.title}`;
}

export function formatCompletedReply(item: Pick<MemoItem, "title">): string {
  return `已完成：${item.title}`;
}

export function formatDeletedReply(item: Pick<MemoItem, "title">): string {
  return `已删除：${item.title}`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
