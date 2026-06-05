# 待办备忘

个人待办事项和备忘录 PWA。默认本地可用，配置 Supabase 后支持电脑和手机多端同步。

## 本地运行

PowerShell 里如果 `npm` 不在 PATH，可以直接调用 `npm.cmd`：

```powershell
& 'C:\nvm4w\nodejs\npm.cmd' install
& 'C:\nvm4w\nodejs\npm.cmd' run dev
```

## 功能

- 待办和备忘录合一
- 清单、标签、搜索、置顶、归档、删除撤销
- 今天、最近 7 天、收集箱、已完成、垃圾箱
- 日历日视图、月视图、年视图
- 自然语言时间识别，例如“晚上8点聚餐”
- 重复任务：每天、每周、每月
- 四象限视图
- 番茄专注，自定义专注和休息时长
- Supabase 邮箱密码登录和多端同步
- iPhone 添加到主屏幕

## Supabase

1. 新建 Supabase 项目。
2. 在 Supabase SQL Editor 执行 `supabase-schema.sql`。
3. 复制 `.env.example` 为 `.env` 或 `.env.local`。
4. 填入：

```env
VITE_SUPABASE_URL=你的 Project URL
VITE_SUPABASE_ANON_KEY=你的 Publishable/Anon key
```

5. 重启开发服务器。

Supabase 控制台还需要确认：

- Authentication > Providers > Email 已启用。
- 建议在 Authentication > Providers > Email 关闭 Confirm email。这样个人使用时注册不会触发邮件发送，也不会撞到 Supabase 内置邮件限流。
- Authentication > URL Configuration > Redirect URLs 加入本地地址，例如 `http://localhost:5173`。
- 部署后把 Vercel 的正式 HTTPS 地址也加入 Redirect URLs。

如果你之前已经导入过旧版 SQL，需要重新执行当前的 `supabase-schema.sql`，它会补上重复任务字段 `repeat_rule`。

## 部署到 Vercel

项目已经包含 `vercel.json`，Vercel 会使用：

- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

部署步骤：

1. 把项目推到 GitHub。
2. 打开 Vercel，选择 Add New Project。
3. 导入这个 GitHub 仓库。
4. 在 Project Settings > Environment Variables 添加：

```env
VITE_SUPABASE_URL=你的 Supabase Project URL
VITE_SUPABASE_ANON_KEY=你的 Supabase Publishable/Anon key
```

5. 点击 Deploy。
6. 部署完成后，把 Vercel 域名加入 Supabase Redirect URLs，例如：

```text
https://your-project.vercel.app
```

7. iPhone Safari 打开 Vercel 地址，分享按钮里选择“添加到主屏幕”。

## 微信机器人

项目已经准备好服务器版 OpenClaw 微信机器人流程：

- 网站登录后可在同步面板点击“生成绑定码”。
- 微信发 `绑定 TD-xxxxxxxxxx` 后，微信会话会绑定到当前 Todo 账号。
- 微信可发 `任务列表`、`今天有什么`、`完成 xxx`、`删除 xxx`、`明天10点提醒我xxx`。
- 云服务器会启动本地 Todo API，OpenClaw 收到微信消息后调用本机 `127.0.0.1`，不依赖服务器访问 Vercel。
- 云服务器上的定时器每分钟扫描提醒，到点后通过 OpenClaw 发回微信。

完整服务器安装和上线流程见：

```text
docs/openclaw-server.md
```

## 构建检查

```powershell
& 'C:\nvm4w\nodejs\npm.cmd' run build
```
