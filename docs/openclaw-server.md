# OpenClaw WeChat Server Deployment

This is the server version of the WeChat todo bot. It does not require your
personal computer to stay on.

## Why Not Use Your Main WeChat

Use a dedicated WeChat account for the bot when possible.

- The OpenClaw WeChat plugin is not the same as the official WeChat Official Account API. Long-running automation can trigger WeChat risk checks.
- The server holds the WeChat login session. If the server is compromised, the bot WeChat account is exposed.
- A bot can accidentally reply too often, reply in the wrong chat, or send reminder text that you do not want mixed with your main social account.
- A dedicated account is easier to reset, replace, or disable during demos.

Your main account can work technically, but it is a bad blast-radius trade-off.

## Architecture

```text
WeChat message
  -> OpenClaw on cloud server
  -> server/openclaw/todo-wechat-hook
  -> https://todo-theta-mauve-75.vercel.app/api/bot/message
  -> Supabase memo_items / bot_bindings
  -> hook reply goes back to WeChat

systemd timer every minute
  -> server/openclaw/reminder-worker.mjs
  -> Supabase due reminder query
  -> openclaw message send
  -> WeChat reminder
```

The server needs OpenClaw because it owns the WeChat session. Vercel remains the
public Todo API, and Supabase remains the database.

## Files Already Prepared

- `api/bot/message.ts`: handles inbound bot commands.
- `api/bot/binding-code.ts`: creates a short-lived website binding code.
- `server/openclaw/todo-wechat-hook/`: OpenClaw inbound message hook.
- `server/openclaw/reminder-worker.mjs`: server-side reminder scanner/sender.
- `server/openclaw/systemd/`: timer templates for one reminder scan per minute.
- `server/openclaw/todo-openclaw.env.example`: server env template.

## Required Values

Vercel environment variables:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
BOT_WEBHOOK_SECRET=choose-a-long-random-secret
BOT_TIME_ZONE=Asia/Shanghai
```

OpenClaw server environment file, usually `/etc/todo-openclaw.env`:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
BOT_TIME_ZONE=Asia/Shanghai
TODO_BOT_BASE_URL=https://todo-theta-mauve-75.vercel.app
TODO_BOT_SECRET=use-the-same-value-as-vercel-BOT_WEBHOOK_SECRET
TODO_BOT_ALLOWED_CHANNELS=openclaw-weixin
OPENCLAW_CHANNEL=openclaw-weixin
OPENCLAW_ACCOUNT=default
OPENCLAW_BIN=/usr/local/bin/openclaw
```

Do not commit real service-role keys or bot secrets.

## Database

Run `supabase-schema.sql` in Supabase SQL Editor after the bot changes are
deployed. It adds:

- `bot_bindings`
- `bot_binding_codes`
- `bot_reminder_events`
- the `consume_bot_binding_code` RPC
- reminder indexes and claim fields

## Server Setup Outline

Use Ubuntu unless you have a strong reason not to.

```bash
sudo apt update
sudo apt install -y git nodejs npm
sudo npm install -g openclaw

sudo mkdir -p /opt
cd /opt
sudo git clone https://github.com/Jaxson-zip/to_do.git
sudo chown -R "$USER":"$USER" /opt/to_do
cd /opt/to_do
npm ci
```

Install the WeChat plugin on the server:

```bash
npx -y @tencent-weixin/openclaw-weixin-cli@latest install
```

Configure and start the OpenClaw gateway, then login the WeChat channel:

```bash
openclaw config set gateway.mode local
openclaw config set gateway.bind loopback
openclaw config set gateway.auth.mode token
openclaw config set gateway.auth.token "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
openclaw gateway install --force
openclaw gateway start
openclaw channels login --channel openclaw-weixin --account default --verbose
openclaw channels status --deep
```

Install the Todo hook into OpenClaw's hook directory:

```bash
mkdir -p ~/.openclaw/hooks/todo-wechat
cp -r /opt/to_do/server/openclaw/todo-wechat-hook/* ~/.openclaw/hooks/todo-wechat/
```

Make sure the OpenClaw gateway process receives the env values from
`/etc/todo-openclaw.env`. If OpenClaw installed a systemd service, find it with:

```bash
systemctl list-units '*openclaw*'
```

Then add an override:

```bash
sudo systemctl edit <openclaw-service-name>
```

Use:

```ini
[Service]
EnvironmentFile=/etc/todo-openclaw.env
```

Reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart <openclaw-service-name>
openclaw hooks list --verbose
```

If the gateway is running as a user service or a shell process instead, export
the same environment variables before starting it.

## Reminder Timer

Create the server env file:

```bash
sudo cp /opt/to_do/server/openclaw/todo-openclaw.env.example /etc/todo-openclaw.env
sudo nano /etc/todo-openclaw.env
sudo chmod 600 /etc/todo-openclaw.env
```

Install the timer:

```bash
sudo cp /opt/to_do/server/openclaw/systemd/todo-openclaw-reminders.service /etc/systemd/system/
sudo cp /opt/to_do/server/openclaw/systemd/todo-openclaw-reminders.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now todo-openclaw-reminders.timer
```

Check it:

```bash
systemctl list-timers '*todo-openclaw*'
journalctl -u todo-openclaw-reminders.service -n 80 --no-pager
```

Manual dry run:

```bash
cd /opt/to_do
TODO_REMINDER_DRY_RUN=1 node server/openclaw/reminder-worker.mjs
```

## Binding Flow

1. Login to the website.
2. Open the sync panel.
3. Click `生成绑定码`.
4. Send the generated text in WeChat, for example:

```text
绑定 TD-1234567890
```

After that, messages from that WeChat chat write to the same Supabase user.

## Test Commands

Send in WeChat:

```text
明天上午10点交作业，提前30分钟提醒
任务列表
今天有什么
完成 交作业
稍后10分钟提醒
```

The first real message after binding is important: it gives the system a stable
OpenClaw sender id that proactive reminders can target later.

## References

- OpenClaw hooks use `HOOK.md` plus `handler.ts`, and `message:received` events can push replies through `event.messages.push(...)`: https://docs.openclaw.ai/automation/hooks
- OpenClaw CLI message send/read reference: https://docs.openclaw.ai/cli/message
- OpenClaw directory limitations depend on channel plugin support: https://docs.openclaw.ai/cli/directory
