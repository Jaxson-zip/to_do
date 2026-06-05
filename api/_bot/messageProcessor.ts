import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBotIntent, type BotIntent } from "./intent.js";
import {
  formatCompletedReply,
  formatCreatedTaskReply,
  formatDeletedReply,
  formatTaskListReply,
} from "./responses.js";
import { findBestOpenTaskMatch, sortOpenTasksForBot } from "./taskMatcher.js";
import { dateKeyInBotTimeZone } from "./time.js";
import {
  type BotProvider,
  createTaskFromIntent,
  fetchOpenTasks,
  markTaskDone,
  snoozeMostRecentReminder,
  softDeleteTask,
} from "./todoRepository.js";

type BotProcessorOptions = {
  reminderProvider?: BotProvider;
};

export async function handleBoundBotText(
  supabase: SupabaseClient,
  userId: string,
  senderId: string,
  text: string,
  options?: BotProcessorOptions
): Promise<string> {
  return handleBoundIntent(supabase, userId, senderId, parseBotIntent(text), options);
}

export async function handleBoundIntent(
  supabase: SupabaseClient,
  userId: string,
  senderId: string,
  intent: BotIntent,
  options?: BotProcessorOptions
): Promise<string> {
  if (intent.type === "unknown") return "我还没看懂这句话。可以试试：今天任务、任务列表、完成 xxx、删除 xxx、明天10点提醒我xxx。";

  if (intent.type === "createTask") {
    const item = await createTaskFromIntent(supabase, userId, intent);
    return formatCreatedTaskReply(item);
  }

  if (intent.type === "listToday") {
    const today = dateKeyInBotTimeZone();
    const tasks = sortOpenTasksForBot(await fetchOpenTasks(supabase, userId)).filter((item) => {
      if (item.dueDate === today) return true;
      if (!item.reminderAt) return false;
      return dateKeyInBotTimeZone(new Date(item.reminderAt)) === today;
    });
    return formatTaskListReply(tasks, "今天没有未完成任务。");
  }

  if (intent.type === "listOpen") {
    const tasks = sortOpenTasksForBot(await fetchOpenTasks(supabase, userId, 20));
    return formatTaskListReply(tasks, "现在没有未完成任务。");
  }

  if (intent.type === "complete" || intent.type === "delete") {
    const match = findBestOpenTaskMatch(await fetchOpenTasks(supabase, userId), intent.query);
    if (!match) return `没找到未完成任务：${intent.query}`;

    if (intent.type === "complete") {
      await markTaskDone(supabase, userId, match.id);
      return formatCompletedReply(match);
    }

    await softDeleteTask(supabase, userId, match.id);
    return formatDeletedReply(match);
  }

  if (intent.type === "snooze") {
    const item = await snoozeMostRecentReminder(
      supabase,
      userId,
      senderId,
      intent.minutes,
      options?.reminderProvider ?? "clawbot"
    );
    if (!item) return "没有找到最近可稍后提醒的任务。";
    return `已调整：${item.title}\n${intent.minutes} 分钟后再提醒你。`;
  }

  return "这个指令暂时还不支持。";
}
