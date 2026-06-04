# WeChat ClawBot Setup

This project now has server-side bot endpoints for a ClawBot-style WeChat assistant.

For the cloud-server OpenClaw setup that does not require your PC to stay on,
see `docs/openclaw-server.md`. That setup uses the inbound message endpoint
below, but sends proactive reminders from the cloud server through
`server/openclaw/reminder-worker.mjs`.

## What It Can Do

- Bind a ClawBot sender id to a Supabase todo account.
- Create tasks from WeChat text, for example `明天上午10点交作业，提前30分钟提醒`.
- Reply to `今天有什么`, `任务列表`, `完成 xxx`, `删除 xxx`, and `稍后10分钟提醒`.
- Scan due reminders and send proactive WeChat messages through ClawBot's send-message API.

## Required Environment Variables

Add these in Vercel Project Settings > Environment Variables:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
BOT_WEBHOOK_SECRET=choose-a-long-random-secret
CLAWBOT_SEND_MESSAGE_URL=https://clawbot.example/send-message
CLAWBOT_SEND_MESSAGE_TOKEN=your-clawbot-send-token
BOT_TIME_ZONE=Asia/Shanghai
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never put it in frontend code or screenshots.

## Database Migration

Run the current `supabase-schema.sql` in Supabase SQL Editor. It creates:

- `bot_bindings`: maps ClawBot sender id to `auth.users.id`.
- `bot_binding_codes`: one-time binding codes.
- `bot_reminder_events`: tracks sent reminders so they do not repeat.

## ClawBot Incoming Webhook

Configure ClawBot's incoming webhook/tool URL to:

```text
https://your-vercel-domain.vercel.app/api/bot/message
```

Preferred request:

```http
POST /api/bot/message
x-bot-secret: your BOT_WEBHOOK_SECRET
content-type: application/json
```

```json
{
  "senderId": "wechat-or-clawbot-user-id",
  "text": "明天上午10点交作业，提前30分钟提醒"
}
```

The endpoint also accepts these common aliases:

- sender id: `senderId`, `userId`, `from`, `openid`, `openId`
- text: `text`, `message`, `content`
- secret: `x-bot-secret`, `Authorization: Bearer ...`, or JSON body field `secret`

Successful replies look like:

```json
{
  "reply": "已记录：交作业\n日期：2026-06-05\n提醒：06/05 09:30"
}
```

## Account Binding

The binding flow is:

```text
Website creates a code like TD-1234567890
User sends "绑定 TD-1234567890" to ClawBot
Bot stores ClawBot sender id -> Supabase user id
Future messages read/write that user's tasks
```

The API for creating a binding code is:

```http
POST /api/bot/binding-code
Authorization: Bearer <Supabase user access token>
```

Response:

```json
{
  "code": "TD-1234567890",
  "expiresAt": "2026-06-04T13:10:00.000Z",
  "instruction": "请在微信机器人里发送：绑定 TD-1234567890"
}
```

The code expires after 10 minutes and can only be used once. Codes are retried on rare collisions.

## Reminder Worker

The reminder endpoint is:

```text
https://your-vercel-domain.vercel.app/api/bot/reminders
```

It expects:

```http
POST /api/bot/reminders
x-bot-secret: your BOT_WEBHOOK_SECRET
content-type: application/json
```

```json
{}
```

It returns counts:

```json
{
  "checked": 2,
  "sent": 1,
  "skipped": 1,
  "failed": 0,
  "details": []
}
```

If `CLAWBOT_SEND_MESSAGE_URL` or `CLAWBOT_SEND_MESSAGE_TOKEN` is missing, due reminders are skipped and not marked as sent.

## Supabase Cron

Supabase Cron can call the Vercel reminder endpoint every minute through `pg_cron` and `pg_net`.

This endpoint intentionally supports the Supabase Cron `POST` flow below. It is not configured for native Vercel Cron because Vercel Cron invokes routes with `GET`, and Vercel Hobby cron is not suitable for minute-level reminders.

Run this in Supabase SQL Editor after replacing the URL and secret:

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'todo-wechat-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://your-vercel-domain.vercel.app/api/bot/reminders',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-bot-secret', 'your BOT_WEBHOOK_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Supabase's official Cron docs describe this pattern as scheduled SQL jobs, and their scheduled Edge Function docs use `pg_cron` with `pg_net` for periodic HTTP calls.

## Manual Test Payloads

Bind:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://your-vercel-domain.vercel.app/api/bot/message" `
  -Headers @{ "x-bot-secret" = "your BOT_WEBHOOK_SECRET" } `
  -ContentType "application/json" `
  -Body '{"senderId":"demo-user","text":"绑定 TD-1234567890"}'
```

Create task:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://your-vercel-domain.vercel.app/api/bot/message" `
  -Headers @{ "x-bot-secret" = "your BOT_WEBHOOK_SECRET" } `
  -ContentType "application/json" `
  -Body '{"senderId":"demo-user","text":"明天上午10点交作业，提前30分钟提醒"}'
```

List tasks:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://your-vercel-domain.vercel.app/api/bot/message" `
  -Headers @{ "x-bot-secret" = "your BOT_WEBHOOK_SECRET" } `
  -ContentType "application/json" `
  -Body '{"senderId":"demo-user","text":"任务列表"}'
```

Complete task:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://your-vercel-domain.vercel.app/api/bot/message" `
  -Headers @{ "x-bot-secret" = "your BOT_WEBHOOK_SECRET" } `
  -ContentType "application/json" `
  -Body '{"senderId":"demo-user","text":"完成 交作业"}'
```

Run reminder scan:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://your-vercel-domain.vercel.app/api/bot/reminders" `
  -Headers @{ "x-bot-secret" = "your BOT_WEBHOOK_SECRET" } `
  -ContentType "application/json" `
  -Body '{}'
```

## Notes

- The exact ClawBot send-message payload may need one small adjustment after you see the real ClawBot configuration page. The current helper sends common fields: `to`, `userId`, `recipientId`, `text`, and `message`.
- The incoming webhook is intentionally flexible so most ClawBot payload shapes work without code changes.
- The website does not yet show a "Generate WeChat binding code" button. The backend endpoint is ready; adding the small UI is a separate polish step.
