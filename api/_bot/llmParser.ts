import OpenAI from "openai";
import type { BotIntent } from "./intent.js";

const apiKey = process.env.VITE_OPENAI_API_KEY;
const baseURL = process.env.VITE_OPENAI_BASE_URL;
const model = process.env.VITE_OPENAI_MODEL || "deepseek-chat";

const openai = apiKey ? new OpenAI({ apiKey, baseURL }) : null;

function getBeijingTimeString(date: Date) {
  const tzOffset = 8 * 60; // Beijing is UTC+8
  const localTime = date.getTime();
  const localOffset = date.getTimezoneOffset(); // in minutes
  const utc = localTime + localOffset * 60000;
  const beijing = utc + tzOffset * 60000;
  const nd = new Date(beijing);

  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${nd.getFullYear()}-${pad(nd.getMonth() + 1)}-${pad(nd.getDate())}T${pad(nd.getHours())}:${pad(nd.getMinutes())}:${pad(nd.getSeconds())}+08:00`;
}

export async function parseIntentWithLLM(
  text: string,
  baseDate: Date,
  recentTasks: { id: string; title: string }[] = []
): Promise<BotIntent | null> {
  if (!openai) {
    return null; // Fallback to Regex if no API key
  }

  const dayMap = ["日", "一", "二", "三", "四", "五", "六"];
  const dateStr = getBeijingTimeString(baseDate);
  const dayOfWeek = dayMap[baseDate.getDay()];

  const prompt = `你是一个待办事项应用的自然语言理解助手。
当前的系统时间是（北京时间）：${dateStr}，星期${dayOfWeek}。

你的任务是将用户的自然语言输入转化为标准化的 JSON 意图。
请务必返回一个合法的 JSON，不要包含任何 \`\`\`json 等 Markdown 包裹，仅输出纯 JSON 文本。

用户可能有以下交互历史上下文（最近的未完成任务）：
${recentTasks.length > 0 ? recentTasks.map(t => `- ID: ${t.id}, 标题: ${t.title}`).join("\n") : "无"}

请返回以下结构之一的 JSON：

1. 创建单任务：
{"type":"createTask", "title":"清理后的任务标题", "dueDate":"YYYY-MM-DD"或null, "eventAt":"带+08:00的ISO格式时间"或null, "reminderAt":"带+08:00的ISO格式时间"或null, "repeatRule":"none|daily|weekly|monthly"}
- "title"：应该去除时间修饰语，例如“明天下午5点去打球提前半小时提醒我”，title 应该是“去打球”。
- "eventAt"：任务实际发生的准确时间，必须包含 +08:00 时区，例如 "2026-06-06T17:00:00+08:00"。
- "reminderAt"：必须包含 +08:00 时区。如果用户说“提前半小时提醒”，请计算减去30分钟；否则与 eventAt 一致。如果没提到具体时间，则置为 null，但 dueDate 必须填。

2. 批量创建任务：
{"type":"createTasks", "items": [{"type":"createTask", "title":"...", ...}, ...]}

3. 记录备忘录（无时间属性的纯文本）：
{"type":"createNote", "title":"标题摘要", "body":"完整文本内容"}

4. 查看任务列表：
查看今天：{"type":"listToday"}
查看所有未完成：{"type":"listOpen"}

5. 完成任务：
模糊匹配：{"type":"complete", "query":"任务名称关键字"}
完成刚提醒/最新的：{"type":"completeRecent"}

6. 删除任务：
{"type":"delete", "query":"任务名称关键字"}
清空所有：{"type":"deleteAllTasks"}

7. 稍后提醒/推迟：
{"type":"snooze", "minutes": 推迟的分钟数}

8. 微信授权绑定：
{"type":"bind", "code": "识别到的绑定码"}

9. 其他无法理解/无意义的：
{"type":"unknown"}
`;

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    parsed.raw = text;

    // Validate and clean up
    if (parsed.type === "createTask") {
      if (!parsed.eventAt && parsed.reminderAt) {
        parsed.eventAt = parsed.reminderAt;
      }
    } else if (parsed.type === "createTasks" && Array.isArray(parsed.items)) {
      parsed.items.forEach((item: any) => {
        if (!item.eventAt && item.reminderAt) {
          item.eventAt = item.reminderAt;
        }
        item.raw = text;
      });
    }

    return parsed as BotIntent;
  } catch (error) {
    console.error("LLM parsing failed:", error);
    return null; // Fallback
  }
}
