# dsh-notify-hub

A DeepSeek Harness (DSH) Web plugin that pushes a message to your phone or team chat
when a task finishes, fails, or waits for an approval.

一个 DeepSeek Harness Web 插件：任务完成、出错或需要审批时，把消息推送到手机或群聊。

## Features

- **Entry point**: a bell button in the sidebar's top-left, right beside **New Session**
  (in the collapsed 56px rail it moves to the sidebar foot so it is still reachable).
- **Channels** (each can be enabled/disabled and tested on its own):
  | Kind | Fields | Endpoint |
  | --- | --- | --- |
  | WeCom bot (企业微信机器人) | Webhook URL | `POST <webhook>`, `msgtype: markdown` |
  | Telegram bot | Bot token, chat id | `POST https://api.telegram.org/bot<token>/sendMessage` |
  | ServerChan Turbo (Server酱) | SendKey | `POST https://sctapi.ftqq.com/<SendKey>.send` |
  | ServerChan SCMax | Key (`scx-<uid>-…`), optional host, tags | `POST https://<uid>.max.ft07.com/v1/send` |
- **Triggers**: task finished, task failed/stopped, approval needed, question for you
  (last one off by default), with a minimum-duration filter and a subagent opt-out.
- **Full reply, not a teaser**: the message carries every assistant text of the turn in
  order (default 4000 chars, configurable up to 40000). WeCom and Telegram split a long
  body into numbered parts instead of cutting it; ServerChan Max accepts up to 100000 bytes.
- **Recent deliveries** list in the dialog, so a failing channel tells you why.

## Install

1. Unzip this folder anywhere on the machine that runs DSH.
2. In DSH, open **Plugins** and use **Add plugin**, then choose the unzipped `dsh-notify-hub`
   directory (a local directory install links it, so edits stay live).
3. Restart DSH once so the Host half (the sender and the `/dsh-notify-hub-api` routes) loads,
   then refresh the page.
4. Click the bell and add your channel.

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
| `index.js` | Host half: session/approval listeners, channel senders, settings API |
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
