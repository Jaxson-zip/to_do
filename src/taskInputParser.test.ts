import { describe, expect, it } from "vitest";
import { parseTaskInput } from "./taskInputParser";

const baseDate = new Date("2026-04-23T09:00:00+08:00");

function localHourMinute(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

describe("parseTaskInput", () => {
  it("parses dot separated evening time without eating the title", () => {
    const parsed = parseTaskInput("晚上5.30体育馆打球", baseDate, { rollPastTime: false });

    expect(parsed.title).toBe("体育馆打球");
    expect(localHourMinute(parsed.reminderAt)).toBe("17:30");
  });

  it("tolerates an extra connector after evening", () => {
    const parsed = parseTaskInput("晚上上5.30体育馆打球", baseDate, { rollPastTime: false });

    expect(parsed.title).toBe("体育馆打球");
    expect(localHourMinute(parsed.reminderAt)).toBe("17:30");
  });

  it("keeps existing colon and half-hour inputs working", () => {
    expect(localHourMinute(parseTaskInput("晚上8:15聚餐", baseDate, { rollPastTime: false }).reminderAt)).toBe("20:15");
    expect(localHourMinute(parseTaskInput("晚上8点半聚餐", baseDate, { rollPastTime: false }).reminderAt)).toBe("20:30");
  });
});
