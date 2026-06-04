import { describe, expect, it } from "vitest";
import { parseBotIntent } from "./intent";

const baseDate = new Date("2026-06-04T08:00:00+08:00");

describe("parseBotIntent", () => {
  it("parses bind commands", () => {
    expect(parseBotIntent("绑定 TD-839201", baseDate)).toEqual({
      type: "bind",
      code: "TD-839201",
    });
    expect(parseBotIntent("bind td839201", baseDate)).toEqual({
      type: "bind",
      code: "TD839201",
    });
  });

  it("parses today-list commands", () => {
    expect(parseBotIntent("今天有什么没完成", baseDate)).toEqual({ type: "listToday" });
    expect(parseBotIntent("今日任务", baseDate)).toEqual({ type: "listToday" });
  });

  it("parses open-list commands", () => {
    expect(parseBotIntent("任务列表", baseDate)).toEqual({ type: "listOpen" });
    expect(parseBotIntent("未完成任务", baseDate)).toEqual({ type: "listOpen" });
    expect(parseBotIntent("tasks", baseDate)).toEqual({ type: "listOpen" });
  });

  it("parses done commands", () => {
    expect(parseBotIntent("完成 复习英语", baseDate)).toEqual({
      type: "complete",
      query: "复习英语",
    });
    expect(parseBotIntent("done homework", baseDate)).toEqual({
      type: "complete",
      query: "homework",
    });
  });

  it("parses delete commands", () => {
    expect(parseBotIntent("删除 复习英语", baseDate)).toEqual({
      type: "delete",
      query: "复习英语",
    });
    expect(parseBotIntent("delete homework", baseDate)).toEqual({
      type: "delete",
      query: "homework",
    });
  });

  it("parses snooze commands", () => {
    expect(parseBotIntent("稍后10分钟提醒", baseDate)).toEqual({
      type: "snooze",
      minutes: 10,
    });
  });

  it("parses create commands through the task input parser", () => {
    const intent = parseBotIntent("明天上午10点交作业", baseDate);

    expect(intent.type).toBe("createTask");
    if (intent.type !== "createTask") throw new Error("expected createTask");
    expect(intent.title).toBe("交作业");
    expect(intent.dueDate).toBe("2026-06-05");
    expect(new Date(intent.reminderAt ?? "").getTime()).toBe(new Date("2026-06-05T02:00:00.000Z").getTime());
    expect(new Date(intent.eventAt ?? "").getTime()).toBe(new Date("2026-06-05T02:00:00.000Z").getTime());
  });

  it("parses create commands with an early reminder offset", () => {
    const intent = parseBotIntent("明天上午10点交作业，提前30分钟提醒", baseDate);

    expect(intent.type).toBe("createTask");
    if (intent.type !== "createTask") throw new Error("expected createTask");
    expect(intent.title).toBe("交作业");
    expect(intent.dueDate).toBe("2026-06-05");
    expect(new Date(intent.reminderAt ?? "").getTime()).toBe(new Date("2026-06-05T01:30:00.000Z").getTime());
    expect(new Date(intent.eventAt ?? "").getTime()).toBe(new Date("2026-06-05T02:00:00.000Z").getTime());
  });
});
