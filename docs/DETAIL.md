# Notification hub

把 DeepSeek Harness 的关键节点推送到手机或群聊：**任务完成**、**任务出错**、**需要审批**、**需要你回答**。

## 入口

侧边栏左上角、**New Session** 按钮右侧的铃铛图标。点开即是一个设置面板：

- **总开关**、四个触发条件、摘要长度、最短耗时过滤、是否忽略子代理会话；
- **渠道列表**：企业微信、Telegram、Server酱 Turbo/SCMax、飞书、钉钉、Bark、ntfy、Discord、Slack、PushPlus、Gotify、通用 Webhook，每个渠道可单独启用/停用、发测试消息、检查连接；
- **最近发送**：本次运行里每次投递的结果（成功/失败原因）。

侧边栏折叠成 56px 图标条时，New Session 行放不下第二个控件，铃铛改到侧边栏底部的操作区（同样一个图标）。
未配置任何启用中的渠道时铃铛呈警示色，悬停提示说明原因。

改动插件文件后，浏览器半在刷新页面后生效；宿主半（发送逻辑、接口返回）需要重启 DeepSeek Harness 才换成新的模块。

## 支持的渠道

| 渠道 | 需要的字段 | 发送接口 |
| --- | --- | --- |
| 企业微信机器人 | Webhook 地址（含 `key=`） | `POST <webhook>`，`msgtype: markdown` |
| Telegram 机器人 | Bot Token、Chat ID | `POST https://api.telegram.org/bot<token>/sendMessage` |
| Server酱 Turbo | SendKey | `POST https://sctapi.ftqq.com/<SendKey>.send` |
| Server酱 SCMax | Key（`scx-<uid>-…`），可选服务器地址、标签 | `POST https://<uid>.max.ft07.com/v1/send` |
| 飞书机器人 | Webhook，可选加签 Secret | 飞书自定义机器人 `text` 消息 |
| 钉钉机器人 | Webhook，可选加签 Secret | 钉钉自定义机器人 `text` 消息 |
| Bark | Device Key，可选服务器 URL | `POST <服务器>/push` |
| ntfy | Topic，可选服务器 URL、Access Token | `POST <服务器>/<topic>` |
| Discord | Webhook | Discord webhook（禁用默认 @ 提及） |
| Slack | Incoming Webhook | Slack webhook |
| PushPlus | Token | `POST https://www.pushplus.plus/send` |
| Gotify | 服务器 URL、应用 Token | `POST <服务器>/message` |
| 通用 Webhook | Webhook URL，可选 Bearer Token | JSON `title/body/summary/tags/source` |

SCMax 的服务器地址留空时，会从 `scx-<uid>-…` 形式的 Key 推导 `https://<uid>.max.ft07.com`；
点 **检查** 会对 `GET /v1/firewall/status?key=<key>` 取一次防火墙/额度状态并显示结果。

每条消息包含标题、正文（Markdown）、摘要与标签；正文默认携带该轮对话的**完整回复**（多步回复按步骤拼接，默认 4000 字，设置里可调到 40000 字），
超出渠道单条上限时：企业微信按 3600 字节、Telegram 按 3800 字自动分条发送（最多 12 条，带 `(1/3)` 序号，超出的部分会注明还有几段未发），
Server酱 Turbo 单篇最多 30000 字节，SCMax 单篇最多 100000 字节，超出才截断并标注。标题仍按渠道限制截短（Turbo 32 字、SCMax 64 字）。
旧版本（v1）设置首次加载时会自动把「摘要长度」提升到 4000 字。

## 触发时机

- **任务完成**：该会话的 `turn/end` 事件 `reason.kind === 'completed'`，且耗时满足“最短耗时”过滤；
- **任务出错**：`reason.kind` 为 `error` / `max-tokens` / `blocked`；
- **需要审批**：`approval/request` 瀑布事件，插件只观察不抢先应答，审批仍由界面作答者决定；
- **需要你回答**：`user-questions/request`（默认关闭）。

用户主动中断（`aborted` / `interrupted`）不会推送。子代理会话默认不推送。

## 设置存放

`$DSH_HOME/notify-hub/settings.json`（默认 `~/.dsh/notify-hub/settings.json`），权限 0600，写入采用临时文件加重命名。
页面读到的密钥字段一律为空字符串，只回传“是否已保存”；保存时留空表示沿用已保存的值。

## 实现边界

- 浏览器半与宿主半通过同源 `/dsh-notify-hub-api` 通信（`state` / `save` / `test` / `check`），非 POST 与跨源请求会被拒绝；
- 通知在宿主进程内发送，Harness 未运行时不会推送；投递记录只保存在内存里，重启后清空；
- 审批通知是“尽力而为”：发送失败只记入最近发送列表，不阻断审批流程。

## 新渠道说明

- 飞书、钉钉如启用「加签」，需填写机器人签名密钥。不能把加签 Secret 与 Webhook URL 混用。
- ntfy.sh 的 Topic 默认可能被其他人订阅，敏感通知应使用自建服务并配置访问控制；测试通知会包含测试消息文本。
- 通用 Webhook 可连接 n8n 等自动化服务，注意这些接收端能看到通知正文。
- 远程端点仅允许 HTTPS，本机回环（localhost/127.0.0.1）允许 HTTP；发送不跟随跳转。
- 新渠道与旧渠道并存，原有保存配置不需要迁移；密钥在设置页保持脱敏。
