# dsh-notify-hub

A DeepSeek Harness (DSH) Web plugin that pushes a message to your phone or team chat
when a task finishes, fails, or waits for an approval.

一个 DeepSeek Harness Web 插件：任务完成、出错或需要审批时，把消息推送到手机或群聊。

## Features

- **Entry point**: a bell button in the sidebar's top-left, right beside **New Session**
  (in the collapsed 56px rail it moves to the sidebar foot so it is still reachable).
- **13 channel types** (unlimited instances; each individually enabled/tested):
  | Kind | Fields | Notes |
  | --- | --- | --- |
  | WeCom bot 企业微信 | Webhook URL | Existing Markdown bot support |
  | Telegram | Bot token, Chat ID | Existing bot API support |
  | ServerChan Turbo | SendKey | Existing Turbo API support |
  | ServerChan SCMax | Key, optional host/tags | Existing SCMax API support |
  | Feishu / Lark 飞书 | Webhook URL, optional signing secret | Custom group bot with signed webhook support |
  | DingTalk 钉钉 | Webhook URL, optional signing secret | Group bot; signs URL if enabled |
  | Bark | Device Key, optional server URL | iOS notifications; default `https://api.day.app` |
  | ntfy | Topic, optional server URL/access token | Default `https://ntfy.sh`; self-hosting supported |
  | Discord | Webhook URL | No automatic user/role mentions |
  | Slack | Incoming Webhook URL | Messages sent as plain text |
  | PushPlus 推送加 | Token | Markdown template |
  | Gotify | Server URL, application token | Self-hosted message server |
  | Generic Webhook | Webhook URL, optional bearer token | Integrate n8n, automation tools or custom endpoints |
- **Triggers**: task finished, task failed/stopped, approval needed, question for you
  (last one off by default), with a minimum-duration filter and a subagent opt-out.
- **Full reply, not a teaser**: the message carries every assistant text of the turn in
  order (default 4000 chars, configurable up to 40000). WeCom, Telegram and the new chat/push channels split a long
  body into numbered parts instead of cutting it; ServerChan Max accepts up to 100000 bytes.
- **Recent deliveries** list in the dialog, so a failing channel tells you why.

## Install

1. Unzip this folder anywhere on the machine that runs DSH.
2. In DSH, open **Plugins** and use **Add plugin**, then choose the unzipped `dsh-notify-hub`
   directory (a local directory install links it, so edits stay live).
3. Restart DSH once so the Host half (the sender and the `/dsh-notify-hub-api` routes) loads,
   then refresh the page.
4. Click the bell and add one or more channels; each can be tested independently.

## Settings

- Stored at `$DSH_HOME/notify-hub/settings.json` (default `~/.dsh/notify-hub/settings.json`),
  written atomically with mode 0600.
- Secret fields are never sent back to the page: the dialog shows whether a secret is saved
  and treats a blank field as "keep the saved value".
- The page and the Host half talk over same-origin `POST /dsh-notify-hub-api/{state,save,test,check}`;
  non-POST and cross-origin calls are refused.

## Privacy

This package ships **no credentials and no personal identifiers**: placeholders use
`<uid>`, and every key, token, webhook and chat id is entered by you at runtime and stays in
your local settings file.

## Layout

| File | Purpose |
| --- | --- |
| `index.js` | Host half: session/approval listeners, existing channel senders, settings API |
| `channels.js` | Additional channel adapters with optional signatures and safe HTTP requests |
| `client.js` | Browser half: sidebar entry button and the settings dialog |
| `cordis.patch.yml` | Bundle patch inserting the plugin row |
| `locale/*.json` | Plugin Manager title/description (en, zh) |
| `docs/DETAIL.md` | Detail page shown in Plugin Manager |
| `icon.svg` | Plugin icon |

## Notes / limits

- Notifications are sent from the Host process, so nothing is delivered while DSH is not running.
- Approval notifications are fire-and-forget: the listener never answers for you, it only
  observes and then delegates to the real approval flow.
- Delivery history lives in memory and resets on restart.

## Generic Webhook payload

`POST` JSON with `title`, `body` (Markdown), `summary`, `tags` (array), and `source: "dsh-notify-hub"`. An optional bearer token is sent in the `Authorization` header. Configure only endpoints you trust: these receive the task content.

Custom remote URLs must use HTTPS; HTTP is allowed only for loopback self-hosted endpoints. Redirects are rejected to avoid leaking credentials. All secrets are stored only on the Host and are masked in the UI. **ntfy.sh topics are public unless you configure access control**: use a random topic or a private self-hosted server, and consider disabling reply bodies for sensitive tasks.

To test adapters without sending real messages, run `npm test` (Node.js 20+). External API availability and account permissions must still be confirmed with each channel's **Send test** button.
