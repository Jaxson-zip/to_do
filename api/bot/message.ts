import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseBotIntent } from "../_bot/intent.js";
import {
  formatCompletedReply,
  formatCreatedTaskReply,
  formatDeletedReply,
  formatTaskListReply,
} from "../_bot/responses.js";
import { findBestOpenTaskMatch, sortOpenTasksForBot } from "../_bot/taskMatcher.js";
import { hasValidBotSecret, readJsonBody, requirePost, sendJson } from "../_bot/http.js";
import { getSupabaseAdmin } from "../_bot/supabaseAdmin.js";
import { dateKeyInBotTimeZone } from "../_bot/time.js";
import {
  bindProviderUser,
  createTaskFromIntent,
  fetchOpenTasks,
  getBotBinding,
  markTaskDone,
  snoozeMostRecentReminder,
  softDeleteTask,
} from "../_bot/todoRepository.js";

type BotMessagePayload = {
  senderId?: string;
  userId?: string;
  from?: string;
  openid?: string;
  openId?: string;
  text?: string;
  message?: string;
  content?: string;
  secret?: string;
};

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (!requirePost(request, response)) return;

  let payload: BotMessagePayload;
  try {
    payload = await readJsonBody<BotMessagePayload>(request);
  } catch {
    sendJson(response, 400, { error: "Invalid JSON body" });
    return;
  }

  if (!hasValidBotSecret(request, payload)) {
    sendJson(response, 401, { error: "Invalid bot secret" });
    return;
  }

  const senderId = getSenderId(payload);
  const text = getMessageText(payload);
  if (!senderId || !text) {
    sendJson(response, 400, { error: "Missing sender id or message text" });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const intent = parseBotIntent(text);

    if (intent.type === "bind") {
      const result = await bindProviderUser(supabase, senderId, intent.code);
      sendJson(response, 200, {
        reply: result === "bound" ? "绑定成功，以后微信消息会同步到你的待办账号。" : "绑定码无效或已过期，请在网站重新生成。",
      });
      return;
    }

    const binding = await getBotBinding(supabase, senderId);
    if (!binding) {
      sendJson(response, 200, { reply: "还没有绑定账号。请先在网站生成绑定码，然后发送：绑定 TD-xxxxxx" });
      return;
    }

    const reply = await handleBoundIntent(supabase, binding.user_id, senderId, intent);
    sendJson(response, 200, { reply });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Bot message failed" });
  }
}

async function handleBoundIntent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  senderId: string,
  intent: ReturnType<typeof parseBotIntent>
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
    const item = await snoozeMostRecentReminder(supabase, userId, senderId, intent.minutes);
    if (!item) return "没有找到最近可稍后提醒的任务。";
    return `已调整：${item.title}\n${intent.minutes} 分钟后再提醒你。`;
  }

  return "这个指令暂时还不支持。";
}

function getSenderId(payload: BotMessagePayload): string | null {
  return firstString(payload.senderId, payload.userId, payload.from, payload.openid, payload.openId);
}

function getMessageText(payload: BotMessagePayload): string | null {
  return firstString(payload.text, payload.message, payload.content);
}

function firstString(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
