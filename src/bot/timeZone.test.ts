import { expect, it } from 'vitest';
import { parseBotIntent } from '../../api/_bot/intent';
import { formatDateTime } from '../../api/_bot/responses';
it('parses and displays Beijing schedules independently of the server timezone', () => {
  const old = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const intent = parseBotIntent('明天晚上8点提醒我微信时区测试', new Date('2026-10-10T15:30:00.000Z'));
    if (intent.type !== 'createTask') throw new Error('Expected task');
    expect(intent.reminderAt).toBe('2026-10-11T12:00:00.000Z');
    expect(intent.dueDate).toBe('2026-10-11');
    expect(formatDateTime(intent.reminderAt!)).toContain('20:00');
  } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
});
it('relative minutes and date-only tasks preserve their time and calendar meaning', () => {
  const base = new Date('2026-10-10T15:59:00.000Z');
  const intent = parseBotIntent('2分钟后提醒我微信提醒测试', base);
  if (intent.type !== 'createTask') throw new Error('Expected task');
  expect(intent.reminderAt).toBe('2026-10-10T16:01:00.000Z');
  expect(intent.dueDate).toBe('2026-10-11');
});
