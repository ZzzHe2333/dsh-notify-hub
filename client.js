/**
 * Client half of dsh-notify-hub.
 *
 * Three registrations share one module-level store:
 *  - `sidebar.session.action` renders the entry button beside New Session at the
 *    sidebar's top-left while the sidebar is wide;
 *  - `sidebar.footer.action` renders the same entry in the collapsed 56px rail,
 *    where a second control would not fit in the New Session row;
 *  - `shell.overlay` renders the settings dialog above every column while open.
 *
 * Settings travel to the Host half through /dsh-notify-hub-api.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-notify-hub',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'notifyHub'
    const API = '/dsh-notify-hub-api'

    const zh = {
      'entry.label': '通知设置',
      'entry.tip': '任务完成或需要审批时发送通知',
      'entry.warn': '还没有启用中的推送渠道，点这里设置',
      'dialog.title': '通知设置',
      'dialog.subtitle': '任务完成、需要审批时，把消息推送到企业微信、Telegram 或 Server酱。',
      'dialog.close': '关闭',
      'dialog.loading': '正在读取设置…',
      'dialog.configPath': '配置文件',
      'section.master': '总开关',
      'section.master.enable': '启用通知',
      'section.master.hint': '关闭后不再发送任何通知。',
      'section.triggers': '触发条件',
      'trigger.turnComplete': '任务完成',
      'trigger.turnFailed': '任务出错或中断',
      'trigger.approval': '需要审批',
      'trigger.question': '需要我回答',
      'trigger.preview': '附带回复摘要',
      'trigger.previewChars': '摘要长度',
      'trigger.previewChars.hint': '最多 40000 字；企业微信/Telegram 超出单条上限时会自动分条发送',
      'trigger.minTurn': '忽略短于(秒)',
      'trigger.subagent': '忽略子代理会话',
      'section.channels': '推送渠道',
      'channels.empty': '还没有渠道，点下面任意一种添加。',
      'channels.add': '添加渠道',
      'channels.enabled': '启用',
      'channels.remove': '删除',
      'channels.test': '发测试',
      'channels.check': '检查',
      'channels.testing': '发送中…',
      'channels.checking': '检查中…',
      'channels.secretKept': '已保存，留空则不修改',
      'channels.noneEnabled': '还没有启用中的渠道，任务完成或需要审批时不会推送。',
      'field.webhook': 'Webhook 地址',
      'field.webhook.hint': 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',
      'field.botToken': 'Bot Token',
      'field.chatId': 'Chat ID',
      'field.chatId.hint': 'chat id 或 @频道用户名',
      'field.sendKey': 'SendKey',
      'field.key': 'Key',
      'field.key.hint': 'scx-<uid>-… ；留空则使用已保存的 Key',
      'field.baseUrl': '服务器地址(可选)',
      'field.baseUrl.hint': 'https://<uid>.max.ft07.com，留空则按 Key 自动推导',
      'field.tags': '附加标签',
      'field.tags.hint': '逗号分隔，最多 6 个',
      'field.name': '名称',
      'type.wecom': '企业微信机器人',
      'type.telegram': 'Telegram 机器人',
      'type.serverchan': 'Server酱 Turbo',
      'type.serverchan-max': 'SCMax',
      'section.recent': '最近发送',
      'recent.empty': '本次运行还没有发送记录。',
      'recent.ok': '成功',
      'recent.fail': '失败',
      'footer.save': '保存',
      'footer.saving': '保存中…',
      'footer.saved': '已保存',
      'footer.reload': '重新读取',
      'footer.reloadConfirm': '放弃尚未保存的修改，重新读取已保存的设置？',
      'footer.warn': '提示',
      'footer.incomplete': '{n} 个渠道还不能发送',
      'error.request': '请求失败：{message}',
      'error.load': '读取设置失败：{message}',
      'result.sent': '发送成功（{ms} ms）',
      'result.missing': '缺少：{fields}',
      'result.failed': '失败：{detail}',
      'result.shapeOk': '地址已填写，可发测试确认',
      'result.firewallOk': '防火墙状态：{detail} · {state}',
      'result.normal': '正常',
      'result.blocked': '已限流',
      'result.telegramOk': '机器人：{bot}',
      'warn.missing': '{name}：缺少 {fields}',
      'sep.detail': '：',
    }

    const en = {
      'entry.label': 'Notification settings',
      'entry.tip': 'Notify me when a task finishes or needs approval',
      'entry.warn': 'No enabled channel yet — open settings',
      'dialog.title': 'Notification settings',
      'dialog.subtitle': 'Push a message to WeCom, Telegram, or ServerChan when a task finishes or waits for approval.',
      'dialog.close': 'Close',
      'dialog.loading': 'Loading settings…',
      'dialog.configPath': 'Settings file',
      'section.master': 'Master switch',
      'section.master.enable': 'Notifications on',
      'section.master.hint': 'No notification is sent while this is off.',
      'section.triggers': 'Triggers',
      'trigger.turnComplete': 'Task finished',
      'trigger.turnFailed': 'Task failed or stopped',
      'trigger.approval': 'Approval needed',
      'trigger.question': 'Question for me',
      'trigger.preview': 'Include reply summary',
      'trigger.previewChars': 'Summary length',
      'trigger.previewChars.hint': 'Up to 40000 characters; WeCom and Telegram split the body across messages beyond their own ceiling',
      'trigger.minTurn': 'Ignore turns shorter than (s)',
      'trigger.subagent': 'Ignore subagent sessions',
      'section.channels': 'Channels',
      'channels.empty': 'No channel yet — add one below.',
      'channels.add': 'Add a channel',
      'channels.enabled': 'Enabled',
      'channels.remove': 'Remove',
      'channels.test': 'Send test',
      'channels.check': 'Check',
      'channels.testing': 'Sending…',
      'channels.checking': 'Checking…',
      'channels.secretKept': 'Saved — leave blank to keep',
      'channels.noneEnabled': 'No enabled channel yet — nothing is pushed when a task finishes or waits for approval.',
      'field.webhook': 'Webhook URL',
      'field.webhook.hint': 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',
      'field.botToken': 'Bot token',
      'field.chatId': 'Chat ID',
      'field.chatId.hint': 'chat id or @channelusername',
      'field.sendKey': 'SendKey',
      'field.key': 'Key',
      'field.key.hint': 'scx-<uid>-… ; blank keeps the saved key',
      'field.baseUrl': 'Server URL (optional)',
      'field.baseUrl.hint': 'https://<uid>.max.ft07.com — derived from the key when blank',
      'field.tags': 'Extra tags',
      'field.tags.hint': 'Comma separated, up to 6',
      'field.name': 'Name',
      'type.wecom': 'WeCom bot',
      'type.telegram': 'Telegram bot',
      'type.serverchan': 'ServerChan Turbo',
      'type.serverchan-max': 'SCMax',
      'section.recent': 'Recent deliveries',
      'recent.empty': 'Nothing has been sent in this run yet.',
      'recent.ok': 'sent',
      'recent.fail': 'failed',
      'footer.save': 'Save',
      'footer.saving': 'Saving…',
      'footer.saved': 'Saved',
      'footer.reload': 'Reload',
      'footer.reloadConfirm': 'Discard the unsaved changes and reload the saved settings?',
      'footer.warn': 'Warning',
      'footer.incomplete': '{n} channel(s) cannot send yet',
      'error.request': 'Request failed: {message}',
      'error.load': 'Could not load settings: {message}',
      'result.sent': 'Sent in {ms} ms',
      'result.missing': 'Missing: {fields}',
      'result.failed': 'Failed: {detail}',
      'result.shapeOk': 'Address filled in — send a test to confirm',
      'result.firewallOk': 'Firewall status: {detail} · {state}',
      'result.normal': 'ok',
      'result.blocked': 'rate limited',
      'result.telegramOk': 'Bot: {bot}',
      'warn.missing': '{name}: missing {fields}',
      'sep.detail': ': ',
    }

    let translate = (key) => key

    /** Read one dictionary entry with `{name}` interpolation. */
    function t(key, values) {
      const template = translate(key)
      if (values === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match))
    }

    /** Empty settings shape used before the Host answers and for a brand-new file. */
    function emptySettings() {
      return {
        enabled: true,
        triggers: { turnComplete: true, turnFailed: true, approval: true, question: false },
        minTurnSeconds: 0,
        includePreview: true,
        previewChars: 4000,
        suppressSubagents: true,
        channels: [],
      }
    }

    const CHANNEL_TEMPLATES = {
      wecom: () => ({ type: 'wecom', name: t('type.wecom'), enabled: true, webhook: '' }),
      telegram: () => ({ type: 'telegram', name: t('type.telegram'), enabled: true, botToken: '', chatId: '' }),
      serverchan: () => ({ type: 'serverchan', name: t('type.serverchan'), enabled: true, sendKey: '' }),
      'serverchan-max': () => ({ type: 'serverchan-max', name: t('type.serverchan-max'), enabled: true, key: '', baseUrl: '', tags: [] }),
    }

    const CHANNEL_ORDER = ['wecom', 'telegram', 'serverchan', 'serverchan-max']

    let channelSeq = 0

    /** Locally unique channel id; the Host keeps it across saves. */
    function newChannelId() {
      channelSeq += 1
      return `ch-${Date.now().toString(36)}-${channelSeq}`
    }

    /** One same-origin JSON call into the Host half. */
    async function rpc(endpoint, args) {
      const response = await fetch(`${API}/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args ?? {}),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.error?.message ?? `${endpoint} failed (${response.status})`)
      }
      return payload.value
    }

    // ---------------------------------------------------------------- store

    const store = {
      open: false,
      loaded: false,
      loading: false,
      saving: false,
      dirty: false,
      settings: emptySettings(),
      recent: [],
      file: '',
      warnings: [],
      status: '',
      error: '',
      probe: {},
    }

    const listeners = new Set()

    /** Replace part of the store and re-render every interested component. */
    function setStore(patch) {
      Object.assign(store, patch)
      for (const listener of listeners) listener()
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }

    /** Subscribe a component to the shared store. */
    function useStore() {
      const [, force] = React.useReducer((value) => value + 1, 0)
      React.useEffect(() => subscribe(force), [])
      return store
    }

    /** Any edit invalidates the saved footer state. */
    const EDITED = { status: '', warnings: [], dirty: true }

    /** Load the Host-side settings into the store. */
    async function loadState() {
      setStore({ loading: true, error: '' })
      try {
        const value = await rpc('state')
        setStore({
          settings: value.settings,
          recent: value.recent ?? [],
          file: value.file ?? '',
          loaded: true,
          loading: false,
          dirty: false,
          status: '',
          warnings: [],
        })
      } catch (error) {
        setStore({ loading: false, error: error instanceof Error ? error.message : String(error) })
      }
    }

    /** Persist the whole settings object, then adopt the masked answer. */
    async function saveState() {
      setStore({ saving: true, status: '', error: '' })
      try {
        const value = await rpc('save', { settings: store.settings })
        setStore({
          settings: value.settings,
          warnings: value.warnings ?? [],
          saving: false,
          loaded: true,
          dirty: false,
          status: t('footer.saved'),
        })
      } catch (error) {
        setStore({ saving: false, error: error instanceof Error ? error.message : String(error) })
      }
    }

    /** Run a probe or test delivery for one draft channel and store its verdict. */
    async function probe(channel, kind) {
      const key = `${channel.id}:${kind}`
      setStore({ probe: { ...store.probe, [key]: { pending: true } } })
      try {
        const result = await rpc(kind === 'test' ? 'test' : 'check', { channel })
        setStore({ probe: { ...store.probe, [key]: { pending: false, result } } })
      } catch (error) {
        setStore({
          probe: {
            ...store.probe,
            [key]: { pending: false, result: { ok: false, code: 'request', detail: error instanceof Error ? error.message : String(error) } },
          },
        })
      }
    }

    // ------------------------------------------------------------- helpers

    /** Immutable channel edit by id. */
    function updateChannel(id, patch) {
      setStore({
        ...EDITED,
        settings: {
          ...store.settings,
          channels: store.settings.channels.map((channel) => (channel.id === id ? { ...channel, ...patch } : channel)),
        },
      })
    }

    /** Immutable trigger edit. */
    function updateTrigger(name, value) {
      setStore({
        ...EDITED,
        settings: { ...store.settings, triggers: { ...store.settings.triggers, [name]: value } },
      })
    }

    /** Immutable settings edit outside the channel list. */
    function updateSettings(patch) {
      setStore({ ...EDITED, settings: { ...store.settings, ...patch } })
    }

    /** Add one channel of the requested kind at the end of the list. */
    function addChannel(type) {
      const template = CHANNEL_TEMPLATES[type]()
      setStore({
        ...EDITED,
        settings: { ...store.settings, channels: [...store.settings.channels, { ...template, id: newChannelId() }] },
      })
    }

    /** Remove one channel. */
    function removeChannel(id) {
      setStore({
        ...EDITED,
        settings: { ...store.settings, channels: store.settings.channels.filter((channel) => channel.id !== id) },
      })
    }

    /** Turn a Host verdict into localized text; unknown details pass through verbatim. */
    function describeResult(result) {
      if (result === undefined || result === null) return ''
      // A Host generation from before the code-based verdicts only sends `detail`.
      if (result.code === undefined && typeof result.detail === 'string') return result.detail
      if (result.ok === true) {
        if (result.code === 'sent') return t('result.sent', { ms: result.ms ?? 0 })
        if (result.code === 'firewall') {
          return t('result.firewallOk', {
            detail: `${result.used ?? 0}/${result.limit ?? 0}`,
            state: result.blocked === true ? t('result.blocked') : t('result.normal'),
          })
        }
        if (result.code === 'telegram') return t('result.telegramOk', { bot: result.detail ?? '' })
        return t('result.shapeOk')
      }
      if (result.code === 'missing') return t('result.missing', { fields: (result.fields ?? []).join(', ') })
      return t('result.failed', { detail: result.detail ?? '' })
    }

    // ------------------------------------------------------------ artwork

    /** Original bell glyph: outline strokes only, inherits the current colour. */
    function BellIcon({ size = 16, warning = false }) {
      return h('svg', {
        viewBox: '0 0 16 16',
        width: size,
        height: size,
        fill: 'none',
        'aria-hidden': true,
        style: { display: 'block', color: warning ? 'var(--dsw-alias-state-warn-primary)' : undefined },
      }, [
        h('path', {
          key: 'body',
          d: 'M3.6 11.1V7.3a4.4 4.4 0 0 1 8.8 0v3.8l1.1 1.4H2.5l1.1-1.4Z',
          stroke: 'currentColor',
          strokeWidth: 1.25,
          strokeLinejoin: 'round',
        }),
        h('path', {
          key: 'clapper',
          d: 'M6.5 13.4a1.6 1.6 0 0 0 3 0',
          stroke: 'currentColor',
          strokeWidth: 1.25,
          strokeLinecap: 'round',
        }),
      ])
    }

    // -------------------------------------------------------------- styles

    const STYLES = `
.dnh-entry{position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dnh-entry-rail{width:36px;height:36px;border-radius:var(--dsw-radius-md,10px)}
.dnh-entry:hover{background-color:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dnh-entry:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));outline-offset:-2px}
.dnh-backdrop{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(12,16,24,.34);pointer-events:auto}
.dnh-panel{display:flex;flex-direction:column;width:min(760px,100%);max-height:min(88vh,780px);overflow:hidden;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,10px);box-shadow:0 18px 48px color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}
.dnh-head{display:flex;align-items:flex-start;gap:12px;padding:16px 18px 12px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dnh-head h2{margin:0;font-size:15px;font-weight:600}
.dnh-head p{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dnh-iconbtn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);font-size:15px;line-height:1;cursor:pointer}
.dnh-iconbtn:hover{background-color:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dnh-body{flex:1;min-height:0;overflow:auto;padding:14px 18px 18px;display:flex;flex-direction:column;gap:18px}
.dnh-section{display:flex;flex-direction:column;gap:10px}
.dnh-section h3{margin:0;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.dnh-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.dnh-toggle{display:inline-flex;align-items:center;gap:7px;cursor:pointer;user-select:none}
.dnh-toggle input{width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dnh-numfield{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary)}
.dnh-input,.dnh-numfield input{min-width:0;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.dnh-numfield input{width:64px}
.dnh-input:focus,.dnh-numfield input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dnh-hint{margin:0;font-size:11.5px;color:var(--dsw-alias-label-secondary);opacity:.85;overflow-wrap:anywhere}
.dnh-card{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,10px);background:var(--dsw-alias-bg-layer-1)}
.dnh-card-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dnh-card-head .dnh-input{flex:1;min-width:120px}
.dnh-chip{flex:none;padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11.5px}
.dnh-field{display:flex;flex-direction:column;gap:4px}
.dnh-field>span{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dnh-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dnh-btn{padding:5px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer}
.dnh-btn:hover{border-color:var(--dsw-alias-border-l2)}
.dnh-btn[disabled]{opacity:.55;cursor:default}
.dnh-btn-primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-label-primary-inverted,#fff)}
.dnh-btn-danger{color:var(--dsw-alias-state-error-primary)}
.dnh-result{min-width:0;max-width:100%;overflow-wrap:anywhere;font-size:12px}
.dnh-result.ok{color:var(--dsw-alias-state-success-primary)}
.dnh-result.fail{color:var(--dsw-alias-state-error-primary)}
.dnh-empty{margin:0;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.dnh-add{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.dnh-foot{display:flex;align-items:center;gap:12px;padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base)}
.dnh-foot .dnh-status{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.dnh-foot .dnh-status.error{color:var(--dsw-alias-state-error-primary)}
.dnh-foot .dnh-status.warn{color:var(--dsw-alias-state-warn-primary)}
.dnh-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.dnh-list li{display:flex;gap:8px;align-items:baseline;font-size:12px;color:var(--dsw-alias-label-secondary);min-width:0}
.dnh-list li>*{min-width:0}
.dnh-list time{flex:none;font-variant-numeric:tabular-nums;opacity:.75}
.dnh-list .ok{color:var(--dsw-alias-state-success-primary)}
.dnh-list .fail{color:var(--dsw-alias-state-error-primary)}
`

    // ------------------------------------------------------------ controls

    /** One labelled text input bound to a channel field. */
    function Field({ label, hint, value, placeholder, onChange, mono = false }) {
      return h('label', { className: 'dnh-field' }, [
        h('span', { key: 'l' }, label),
        h('input', {
          key: 'i',
          className: 'dnh-input',
          type: 'text',
          value: value ?? '',
          placeholder: placeholder ?? '',
          spellCheck: false,
          autoComplete: 'off',
          style: mono ? { fontFamily: 'var(--ds-font-family-code, monospace)' } : undefined,
          onChange: (event) => { onChange(event.target.value) },
        }),
        hint === undefined ? null : h('p', { key: 'h', className: 'dnh-hint' }, hint),
      ])
    }

    /** One checkbox row. */
    function Toggle({ label, checked, onChange }) {
      return h('label', { className: 'dnh-toggle' }, [
        h('input', {
          key: 'c',
          type: 'checkbox',
          checked: checked === true,
          onChange: (event) => { onChange(event.target.checked) },
        }),
        h('span', { key: 'l' }, label),
      ])
    }

    /** Probe verdict for one channel action; the button itself reports pending. */
    function Result({ value }) {
      if (value === undefined || value.pending === true) return null
      const result = value.result ?? { ok: false, code: 'request', detail: '' }
      const text = describeResult(result)
      return h('span', {
        className: `dnh-result ${result.ok ? 'ok' : 'fail'}`,
        title: text,
      }, `${result.ok ? '✓' : '✕'} ${text}`)
    }

    /** One channel card: identity, kind-specific fields, and its own actions. */
    function ChannelCard({ channel }) {
      const secret = channel.hasSecret ?? {}
      const secretNote = (field, saved) => (saved === true && (channel[field] ?? '') === '' ? t('channels.secretKept') : undefined)
      const actions = []

      if (channel.type === 'serverchan-max' || channel.type === 'telegram') {
        const verdict = store.probe[`${channel.id}:check`]
        actions.push(h('button', {
          key: 'check',
          type: 'button',
          className: 'dnh-btn',
          disabled: verdict?.pending === true,
          onClick: () => { void probe(channel, 'check') },
        }, verdict?.pending === true ? t('channels.checking') : t('channels.check')))
        actions.push(h(Result, { key: 'check-r', value: verdict }))
      }
      const testVerdict = store.probe[`${channel.id}:test`]
      actions.push(h('button', {
        key: 'test',
        type: 'button',
        className: 'dnh-btn',
        disabled: testVerdict?.pending === true,
        onClick: () => { void probe(channel, 'test') },
      }, testVerdict?.pending === true ? t('channels.testing') : t('channels.test')))
      actions.push(h(Result, { key: 'test-r', value: testVerdict }))

      const fields = []
      if (channel.type === 'wecom') {
        fields.push(h(Field, {
          key: 'webhook',
          label: t('field.webhook'),
          hint: secretNote('webhook', secret.webhook) ?? t('field.webhook.hint'),
          value: channel.webhook,
          placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…',
          mono: true,
          onChange: (value) => { updateChannel(channel.id, { webhook: value }) },
        }))
      } else if (channel.type === 'telegram') {
        fields.push(h(Field, {
          key: 'token',
          label: t('field.botToken'),
          hint: secretNote('botToken', secret.botToken),
          value: channel.botToken,
          placeholder: '123456:ABC-DEF…',
          mono: true,
          onChange: (value) => { updateChannel(channel.id, { botToken: value }) },
        }))
        fields.push(h(Field, {
          key: 'chat',
          label: t('field.chatId'),
          hint: t('field.chatId.hint'),
          value: channel.chatId,
          placeholder: '123456789',
          mono: true,
          onChange: (value) => { updateChannel(channel.id, { chatId: value }) },
        }))
      } else if (channel.type === 'serverchan') {
        fields.push(h(Field, {
          key: 'sendkey',
          label: t('field.sendKey'),
          hint: secretNote('sendKey', secret.sendKey) ?? 'SCT…',
          value: channel.sendKey,
          placeholder: 'SCT123…',
          mono: true,
          onChange: (value) => { updateChannel(channel.id, { sendKey: value }) },
        }))
      } else {
        fields.push(h(Field, {
          key: 'key',
          label: t('field.key'),
          hint: secretNote('key', secret.key) ?? t('field.key.hint'),
          value: channel.key,
          placeholder: 'scx-<uid>-…',
          mono: true,
          onChange: (value) => { updateChannel(channel.id, { key: value }) },
        }))
        fields.push(h(Field, {
          key: 'base',
          label: t('field.baseUrl'),
          hint: t('field.baseUrl.hint'),
          value: channel.baseUrl,
          placeholder: 'https://<uid>.max.ft07.com',
          mono: true,
          onChange: (value) => { updateChannel(channel.id, { baseUrl: value }) },
        }))
        fields.push(h(Field, {
          key: 'tags',
          label: t('field.tags'),
          hint: t('field.tags.hint'),
          value: Array.isArray(channel.tags) ? channel.tags.join(', ') : '',
          placeholder: 'dsh, 实验',
          onChange: (value) => {
            updateChannel(channel.id, {
              tags: value.split(/[,，]/).map((tag) => tag.trim()).filter((tag) => tag.length > 0).slice(0, 6),
            })
          },
        }))
      }

      return h('div', { className: 'dnh-card' }, [
        h('div', { key: 'head', className: 'dnh-card-head' }, [
          h('span', { key: 'chip', className: 'dnh-chip' }, t(`type.${channel.type}`)),
          h('input', {
            key: 'name',
            className: 'dnh-input',
            type: 'text',
            value: channel.name ?? '',
            'aria-label': t('field.name'),
            onChange: (event) => { updateChannel(channel.id, { name: event.target.value }) },
          }),
          h(Toggle, {
            key: 'enabled',
            label: t('channels.enabled'),
            checked: channel.enabled,
            onChange: (value) => { updateChannel(channel.id, { enabled: value }) },
          }),
          h('button', {
            key: 'remove',
            type: 'button',
            className: 'dnh-btn dnh-btn-danger',
            onClick: () => { removeChannel(channel.id) },
          }, t('channels.remove')),
        ]),
        ...fields,
        h('div', { key: 'actions', className: 'dnh-actions' }, actions),
      ])
    }

    // ------------------------------------------------------------- dialogs

    /** The settings dialog; renders nothing while closed. */
    function SettingsDialog() {
      const state = useStore()
      const panel = React.useRef(null)
      const close = React.useCallback(() => { setStore({ open: false }) }, [])

      React.useEffect(() => {
        if (!state.open) return undefined
        const onKey = (event) => { if (event.key === 'Escape') close() }
        document.addEventListener('keydown', onKey)
        // Move the keyboard focus into the panel so Escape and Tab act on the dialog.
        panel.current?.focus?.()
        return () => { document.removeEventListener('keydown', onKey) }
      }, [state.open, close])

      React.useEffect(() => {
        // One attempt per failure: the footer offers an explicit retry instead of a fetch loop.
        if (state.open && !state.loaded && !state.loading && state.error === '') void loadState()
      }, [state.open, state.loaded, state.loading, state.error])

      if (!state.open) return null

      const settings = state.settings
      const incomplete = settings.channels.filter((channel) => {
        if (channel.type === 'wecom') return (channel.webhook ?? '').length === 0 && channel.hasSecret?.webhook !== true
        if (channel.type === 'telegram') return (channel.botToken ?? '').length === 0 && channel.hasSecret?.botToken !== true
        if (channel.type === 'serverchan') return (channel.sendKey ?? '').length === 0 && channel.hasSecret?.sendKey !== true
        return (channel.key ?? '').length === 0 && channel.hasSecret?.key !== true
      }).length

      let status = state.status
      let statusClass = ''
      if (state.loaded && state.error.length > 0) {
        status = t('error.request', { message: state.error })
        statusClass = 'error'
      } else if (state.warnings.length > 0) {
        status = state.warnings.map((warning) => (
          warning !== null && typeof warning === 'object' && Array.isArray(warning.fields)
            ? t('warn.missing', { name: warning.name, fields: warning.fields.join(', ') })
            : String(warning)
        )).join('; ')
        statusClass = 'warn'
      } else if (incomplete > 0 && status.length === 0) {
        status = t('footer.incomplete', { n: incomplete })
        statusClass = 'warn'
      }

      // Before the first successful load the form would show invented defaults, so block it.
      const loadedBody = state.loaded ? null : [
        h('p', {
          key: 'state',
          className: state.error.length > 0 ? 'dnh-empty dnh-result fail' : 'dnh-empty',
        }, state.error.length > 0 ? t('error.load', { message: state.error }) : t('dialog.loading')),
      ]

      return h('div', {
        className: 'dnh-backdrop',
        onMouseDown: (event) => { if (event.target === event.currentTarget) close() },
      }, h('div', {
        ref: panel,
        tabIndex: -1,
        className: 'dnh-panel',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('dialog.title'),
        style: { outline: 'none' },
      }, [
        h('div', { key: 'head', className: 'dnh-head' }, [
          h('div', { key: 'text', style: { flex: 1, minWidth: 0 } }, [
            h('h2', { key: 'title' }, t('dialog.title')),
            h('p', { key: 'sub' }, t('dialog.subtitle')),
          ]),
          h('button', {
            key: 'close',
            type: 'button',
            className: 'dnh-iconbtn',
            'aria-label': t('dialog.close'),
            onClick: close,
          }, '✕'),
        ]),
        h('div', { key: 'body', className: 'dnh-body' }, loadedBody ?? [
          h('div', { key: 'master', className: 'dnh-section' }, [
            h('h3', { key: 'h' }, t('section.master')),
            h('div', { key: 'row', className: 'dnh-row' }, [
              h(Toggle, {
                key: 'on',
                label: t('section.master.enable'),
                checked: settings.enabled,
                onChange: (value) => { updateSettings({ enabled: value }) },
              }),
              h('p', { key: 'hint', className: 'dnh-hint' }, t('section.master.hint')),
            ]),
          ]),
          h('div', { key: 'triggers', className: 'dnh-section' }, [
            h('h3', { key: 'h' }, t('section.triggers')),
            h('div', { key: 'row1', className: 'dnh-row' }, [
              h(Toggle, { key: 'tc', label: t('trigger.turnComplete'), checked: settings.triggers.turnComplete, onChange: (value) => { updateTrigger('turnComplete', value) } }),
              h(Toggle, { key: 'tf', label: t('trigger.turnFailed'), checked: settings.triggers.turnFailed, onChange: (value) => { updateTrigger('turnFailed', value) } }),
              h(Toggle, { key: 'ap', label: t('trigger.approval'), checked: settings.triggers.approval, onChange: (value) => { updateTrigger('approval', value) } }),
              h(Toggle, { key: 'qu', label: t('trigger.question'), checked: settings.triggers.question, onChange: (value) => { updateTrigger('question', value) } }),
            ]),
            h('div', { key: 'row2', className: 'dnh-row' }, [
              h(Toggle, {
                key: 'prev',
                label: t('trigger.preview'),
                checked: settings.includePreview,
                onChange: (value) => { updateSettings({ includePreview: value }) },
              }),
              h('label', { key: 'chars', className: 'dnh-numfield' }, [
                h('span', { key: 'l' }, t('trigger.previewChars')),
                h('input', {
                  key: 'i',
                  type: 'number',
                  min: 200,
                  max: 40000,
                  step: 100,
                  value: settings.previewChars,
                  onChange: (event) => { updateSettings({ previewChars: Number(event.target.value) }) },
                }),
              ]),
              h('label', { key: 'min', className: 'dnh-numfield' }, [
                h('span', { key: 'l' }, t('trigger.minTurn')),
                h('input', {
                  key: 'i',
                  type: 'number',
                  min: 0,
                  max: 3600,
                  value: settings.minTurnSeconds,
                  onChange: (event) => { updateSettings({ minTurnSeconds: Number(event.target.value) }) },
                }),
              ]),
              h(Toggle, {
                key: 'sub',
                label: t('trigger.subagent'),
                checked: settings.suppressSubagents,
                onChange: (value) => { updateSettings({ suppressSubagents: value }) },
              }),
            ]),
            h('p', { key: 'preview-hint', className: 'dnh-hint' }, t('trigger.previewChars.hint')),
          ]),
          h('div', { key: 'channels', className: 'dnh-section' }, [
            h('h3', { key: 'h' }, t('section.channels')),
            settings.channels.some((channel) => channel.enabled === true)
              ? null
              : h('p', { key: 'off', className: 'dnh-hint' }, t('channels.noneEnabled')),
            settings.channels.length === 0
              ? h('p', { key: 'empty', className: 'dnh-empty' }, t('channels.empty'))
              : settings.channels.map((channel) => h(ChannelCard, { key: channel.id, channel })),
            h('div', { key: 'add', className: 'dnh-add' }, [
              h('span', { key: 'label', className: 'dnh-hint' }, t('channels.add')),
              ...CHANNEL_ORDER.map((type) => h('button', {
                key: type,
                type: 'button',
                className: 'dnh-btn',
                onClick: () => { addChannel(type) },
              }, t(`type.${type}`))),
            ]),
          ]),
          h('div', { key: 'recent', className: 'dnh-section' }, [
            h('h3', { key: 'h' }, t('section.recent')),
            state.recent.length === 0
              ? h('p', { key: 'empty', className: 'dnh-empty' }, t('recent.empty'))
              : h('ul', { key: 'list', className: 'dnh-list' }, state.recent.slice(0, 8).map((record, index) => h('li', { key: `${record.time}-${index}` }, [
                h('time', { key: 't' }, new Date(record.time).toLocaleTimeString()),
                h('span', { key: 'c' }, record.channel),
                h('span', { key: 's', className: record.ok ? 'ok' : 'fail' }, record.ok
                  ? t('recent.ok')
                  : describeResult(record)),
                h('span', { key: 'm', style: { opacity: .7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, record.title ?? ''),
              ]))),
          ]),
          state.file.length > 0
            ? h('p', { key: 'file', className: 'dnh-hint' }, `${t('dialog.configPath')}${t('sep.detail')}${state.file}`)
            : null,
        ]),
        h('div', { key: 'foot', className: 'dnh-foot' }, [
          h('span', { key: 'status', className: `dnh-status ${statusClass}`, title: status }, status),
          h('button', {
            key: 'reload',
            type: 'button',
            className: 'dnh-btn',
            onClick: () => {
              if (store.dirty && !window.confirm(t('footer.reloadConfirm'))) return
              void loadState()
            },
          }, t('footer.reload')),
          h('button', {
            key: 'save',
            type: 'button',
            className: 'dnh-btn dnh-btn-primary',
            disabled: state.saving,
            onClick: () => { void saveState() },
          }, state.saving ? t('footer.saving') : t('footer.save')),
        ]),
      ]))
    }

    // -------------------------------------------------------------- entries

    /** Entry button: opens the dialog from the sidebar row or the collapsed rail. */
    function EntryButton({ rail = false }) {
      const state = useStore()
      React.useEffect(() => {
        if (!state.loaded && !state.loading && state.error === '') void loadState()
      }, [])
      const configured = state.settings.channels.some((channel) => channel.enabled === true)
      const warning = state.loaded && !configured
      return h('button', {
        type: 'button',
        className: rail ? 'dnh-entry dnh-entry-rail' : 'dnh-entry',
        title: warning ? t('entry.warn') : t('entry.tip'),
        'aria-label': t('entry.label'),
        'aria-expanded': state.open,
        onClick: () => { setStore({ open: !store.open }) },
      }, h(BellIcon, { key: 'icon', warning }))
    }

    /** HOC layer around the New Session row: the row content plus our button. */
    function SessionActionLayer(props) {
      const children = props?.children ?? null
      // The 56px rail renders the same entry through `sidebar.footer.action` instead:
      // a second control beside New Session would not fit there.
      if (props?.wide === false) return children
      return h(React.Fragment, null, children, h(EntryButton, { key: 'notify-entry' }))
    }

    /** Rail-only entry at the sidebar foot, so a collapsed sidebar keeps a way in. */
    function RailEntry(props) {
      if (props?.wide !== false) return null
      return h(EntryButton, { rail: true })
    }

    const inject = ['slots', 'locale']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-notify-hub: dictionaries')
      translate = ctx.locale.bind(NS)

      // One package-owned stylesheet for every registration, disposed with the plugin.
      ctx.effect(() => {
        const element = document.createElement('style')
        element.setAttribute('data-dsh-notify-hub', '')
        element.textContent = STYLES
        document.head.appendChild(element)
        return () => { element.remove() }
      }, 'dsh-notify-hub: styles')

      ctx.slots.inject('sidebar.session.action', () => ctx.slots.register({
        name: 'sidebar.session.action',
        id: 'dsh-notify-hub-entry',
        order: 10,
      }, SessionActionLayer))

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'dsh-notify-hub-rail-entry',
        order: 30,
        label: () => translate('entry.label'),
      }, RailEntry))

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'dsh-notify-hub-dialog',
        order: 40,
        label: () => translate('dialog.title'),
      }, SettingsDialog))
    }

    return { inject, apply }
  },
})
