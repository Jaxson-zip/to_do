export function dateKeyInBotTimeZone(date = new Date()): string {
  return dateKeyInTimeZone(date, getBotTimeZone());
}

export function getBotTimeZone(): string {
  return process.env.BOT_TIME_ZONE || "Asia/Shanghai";
}

// Calendar arithmetic uses UTC fields as a neutral representation of wall time.
// This avoids depending on the Vercel/Linux process timezone.
export function botCalendarDate(date: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: getBotTimeZone(),
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = (key: string) => Number(parts.find(part => part.type === key)?.value);
  return new Date(Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'), date.getUTCMilliseconds()));
}

export function instantFromBotCalendar(wall: Date): Date {
  let instant = new Date(wall);
  // Re-evaluate the offset at the target date (including DST transitions).
  for (let i = 0; i < 3; i++) {
    const offset = botCalendarDate(instant).getTime() - instant.getTime();
    const next = new Date(wall.getTime() - offset);
    if (next.getTime() === instant.getTime()) break;
    instant = next;
  }
  return instant;
}

export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return date.toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}
