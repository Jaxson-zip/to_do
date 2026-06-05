import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoItem } from "../../api/_bot/types";

const getSupabaseAdmin = vi.fn();
const bindProviderUser = vi.fn();
const fetchOpenTasks = vi.fn();
const getBotBinding = vi.fn();
const createTaskFromIntent = vi.fn();
const markTaskDone = vi.fn();
const softDeleteTask = vi.fn();
const snoozeMostRecentReminder = vi.fn();

vi.mock("../../api/_bot/supabaseAdmin.js", () => ({
  getSupabaseAdmin,
}));

vi.mock("../../api/_bot/todoRepository.js", () => ({
  bindProviderUser,
  createTaskFromIntent,
  fetchOpenTasks,
  getBotBinding,
  markTaskDone,
  softDeleteTask,
  snoozeMostRecentReminder,
}));

const { default: messageHandler } = await import("../../api/bot/message");

describe("bot message handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_WEBHOOK_SECRET = "test-secret";
    getSupabaseAdmin.mockReturnValue({ client: "supabase" });
  });

  it("stays silent for unbound non-bind messages", async () => {
    getBotBinding.mockResolvedValue(null);

    const response = await invokeMessageHandler({ senderId: "wechat-user", text: "任务列表" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ reply: "" });
    expect(getBotBinding).toHaveBeenCalledWith({ client: "supabase" }, "wechat-user");
    expect(fetchOpenTasks).not.toHaveBeenCalled();
  });

  it("still replies to binding commands from unbound users", async () => {
    bindProviderUser.mockResolvedValue("invalid");

    const response = await invokeMessageHandler({ senderId: "wechat-user", text: "绑定 TD-0000000000" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ reply: "绑定码无效或已过期，请在网站重新生成。" });
    expect(bindProviderUser).toHaveBeenCalledWith({ client: "supabase" }, "wechat-user", "TD-0000000000");
    expect(getBotBinding).not.toHaveBeenCalled();
  });

  it("handles task commands for bound users", async () => {
    getBotBinding.mockResolvedValue({ provider: "clawbot", provider_user_id: "wechat-user", user_id: "todo-user" });
    fetchOpenTasks.mockResolvedValue([]);

    const response = await invokeMessageHandler({ senderId: "wechat-user", text: "任务列表" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ reply: "现在没有未完成任务。" });
    expect(fetchOpenTasks).toHaveBeenCalledWith({ client: "supabase" }, "todo-user", 20);
  });
});

async function invokeMessageHandler(body: Record<string, unknown>) {
  const response = createMockResponse();
  await messageHandler(
    {
      method: "POST",
      headers: { "x-bot-secret": "test-secret" },
      body,
    } as never,
    response as never
  );
  return response;
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}
