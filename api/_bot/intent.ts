import { parseTaskInput } from "./taskInputParser.js";

export type BotIntent =
  | { type: "bind"; code: string }
  | { type: "listToday" }
  | { type: "listOpen" }
  | { type: "complete"; query: string }
  | { type: "delete"; query: string }
  | { type: "snooze"; minutes: number }
  | {
      type: "createTask";
      title: string;
      dueDate: string | null;
      reminderAt: string | null;
      eventAt: string | null;
      raw: string;
    }
  | { type: "unknown"; raw: string };

type EarlyReminderOffset = {
  matchedText: string;
  minutes: number;
};

export function parseBotIntent(rawText: string, baseDate = new Date()): BotIntent {
  const text = normalizeText(rawText);
  if (!text) return { type: "unknown", raw: rawText };

  const bind = text.match(/^(?:绑定|bind)\s+([a-z]{2,8}-?\d{4,10})$/i);
  if (bind) return { type: "bind", code: bind[1].toUpperCase() };

  if (/^(?:今天有什么.*|今天.*任务|今日任务)$/i.test(text)) return { type: "listToday" };
  if (/^(?:任务列表|未完成任务|待办列表|list|tasks)$/i.test(text)) return { type: "listOpen" };

  const complete = text.match(/^(?:完成|搞定|done)\s*(.+)$/i);
  if (complete?.[1]?.trim()) return { type: "complete", query: complete[1].trim() };

  const remove = text.match(/^(?:删除|取消|delete)\s*(.+)$/i);
  if (remove?.[1]?.trim()) return { type: "delete", query: remove[1].trim() };

  const snooze = text.match(/^(?:稍后|snooze)\s*(\d{1,3})\s*(?:分钟|分|min|minutes?)?(?:提醒)?$/i);
  if (snooze) return { type: "snooze", minutes: clampMinutes(Number(snooze[1])) };

  const offset = parseEarlyOffset(text);
  const taskText = cleanupTaskText(offset ? text.replace(offset.matchedText, "") : text);
  const parsed = parseTaskInput(taskText, baseDate);
  const title = parsed.title.trim();
  if (!title) return { type: "unknown", raw: rawText };

  const eventAt = parsed.reminderAt;
  const reminderAt =
    eventAt && offset ? new Date(new Date(eventAt).getTime() - offset.minutes * 60_000).toISOString() : parsed.reminderAt;

  return {
    type: "createTask",
    title,
    dueDate: parsed.dueDate,
    reminderAt,
    eventAt,
    raw: rawText,
  };
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function parseEarlyOffset(text: string): EarlyReminderOffset | null {
  const match = text.match(/[，,、\s]*(?:提前|early)\s*(\d{1,3})\s*(分钟|分|小时|个小时|min|minutes?|hours?)\s*(?:提醒|reminder)?/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const minutes = unit.includes("小时") || unit.startsWith("hour") ? amount * 60 : amount;
  return { matchedText: match[0], minutes: clampMinutes(minutes) };
}

function cleanupTaskText(value: string): string {
  return value.replace(/[，,、\s]+$/g, "").trim();
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 10;
  return Math.min(1440, Math.max(1, Math.round(value)));
}
