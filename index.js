/**
 * Host half of dsh-notify-hub.
 *
 * Watches the durable session log for finished turns and the approval/question
 * waterfalls for pending requests, then pushes one message per enabled channel
 * (WeCom webhook, Telegram bot, ServerChan Turbo, ServerChan SCMax).
 *
 * The browser half owns the settings dialog and talks to this half through the
 * JSON endpoints registered under API_BASE on the shared web server.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** Prefix route owned by this plugin on the shared web server. */
const API_BASE = '/dsh-notify-hub-api'
/** Saved-settings format version; bump when the shape changes incompatibly. */
const SETTINGS_VERSION = 2
/** Reply characters a notification carries unless the settings say otherwise. */
const DEFAULT_PREVIEW_CHARS = 4000
/** Largest reply section one message may carry; channels chunk the body beyond their own ceiling. */
const MAX_PREVIEW_CHARS = 40000
/** Messages one delivery may spend on a long body (per channel). */
const MAX_CHUNKS = 12
/** Body ceilings per channel, in the unit that channel counts (see `splitBody`). */
const LIMITS = {
  wecom: { bytes: 3600 },
  telegram: { chars: 3800 },
  serverchan: { bytes: 30000 },
  'serverchan-max': { bytes: 100000 },
}
/** Channel kinds this version delivers to. */
const CHANNEL_TYPES = ['wecom', 'telegram', 'serverchan', 'serverchan-max']
/** Secret fields per channel kind: never returned to the page, blank keeps the stored value. */
const SECRET_FIELDS = {
  wecom: ['webhook'],
  telegram: ['botToken'],
  serverchan: ['sendKey'],
  'serverchan-max': ['key'],
}
/** One channel's required non-secret fields, used for save warnings and send skips. */
const REQUIRED_FIELDS = {
  wecom: ['webhook'],
  telegram: ['botToken', 'chatId'],
  serverchan: ['sendKey'],
  'serverchan-max': ['key'],
}
/** Bounded in-memory delivery record shown in the dialog. */
const MAX_RECENT = 30
/** Per-request network budget for one channel delivery. */
const REQUEST_TIMEOUT_MS = 10000
/** Largest session bookkeeping map; oldest sessions are dropped beyond this. */
const MAX_TRACKED_SESSIONS = 200

export const inject = ['webServer']

/** Settings root inside the harness home. */
function settingsFile() {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'notify-hub', 'settings.json')
}

/** Fresh settings with every trigger on the defaults this version ships. */
function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    enabled: true,
    triggers: { turnComplete: true, turnFailed: true, approval: true, question: false },
    minTurnSeconds: 0,
    includePreview: true,
    previewChars: DEFAULT_PREVIEW_CHARS,
    suppressSubagents: true,
    channels: [],
  }
}

/** Coerce any stored or submitted value into the settings shape this version reads. */
function normalizeSettings(input) {
  const base = defaultSettings()
  if (typeof input !== 'object' || input === null) return base
  const value = input
  const triggers = typeof value.triggers === 'object' && value.triggers !== null ? value.triggers : {}
  const settings = {
    version: SETTINGS_VERSION,
    enabled: value.enabled !== false,
    triggers: {
      turnComplete: triggers.turnComplete !== false,
      turnFailed: triggers.turnFailed !== false,
      approval: triggers.approval !== false,
      question: triggers.question === true,
    },
    minTurnSeconds: clampNumber(value.minTurnSeconds, 0, 3600, base.minTurnSeconds),
    includePreview: value.includePreview !== false,
    previewChars: Math.round(clampNumber(value.previewChars, 200, MAX_PREVIEW_CHARS, base.previewChars)),
    suppressSubagents: value.suppressSubagents !== false,
    channels: [],
  }
  const channels = Array.isArray(value.channels) ? value.channels : []
  channels.forEach((candidate, index) => {
    const channel = normalizeChannel(candidate, index)
    if (channel !== undefined) settings.channels.push(channel)
  })
  return settings
}

/** One channel record; unknown kinds and missing ids are dropped. */
function normalizeChannel(input, index) {
  if (typeof input !== 'object' || input === null) return undefined
  const value = input
  if (typeof value.type !== 'string' || !CHANNEL_TYPES.includes(value.type)) return undefined
  const channel = {
    id: typeof value.id === 'string' && value.id.length > 0 ? value.id.slice(0, 64) : `channel-${index + 1}-${Date.now()}`,
    type: value.type,
    name: typeof value.name === 'string' && value.name.trim().length > 0
      ? value.name.trim().slice(0, 60)
      : value.type,
    enabled: value.enabled !== false,
  }
  for (const field of ['webhook', 'botToken', 'chatId', 'sendKey', 'key', 'baseUrl']) {
    if (typeof value[field] === 'string') channel[field] = value[field].trim()
  }
  if (Array.isArray(value.tags)) {
    channel.tags = value.tags
      .filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
      .map((tag) => tag.trim().slice(0, 20))
      .slice(0, 6)
  }
  return channel
}

/** Round a numeric field into its accepted range. */
function clampNumber(value, min, max, fallback) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

/** Read the saved settings, falling back to defaults on a missing or unreadable file. */
function loadSettings(logger) {
  const file = settingsFile()
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const storedVersion = typeof raw?.version === 'number' ? raw.version : 0
    const settings = normalizeSettings(raw)
    if (storedVersion < SETTINGS_VERSION) {
      // v2 carries the whole reply instead of a short excerpt; raise an old, small value once.
      settings.previewChars = Math.max(settings.previewChars, DEFAULT_PREVIEW_CHARS)
      logger?.info?.('notify-hub: settings migrated to v%d (reply length %d)', SETTINGS_VERSION, settings.previewChars)
      try { saveSettings(settings) } catch (error) {
        logger?.warn?.('notify-hub: settings migration not saved: %s', String(error))
      }
    }
    return settings
  } catch (error) {
    if (error != null && error.code !== 'ENOENT') logger?.warn?.('notify-hub: settings unreadable (%s)', String(error))
    return defaultSettings()
  }
}

/** Replace the settings file atomically: temp file in the same directory, then rename. */
function saveSettings(settings) {
  const file = settingsFile()
  mkdirSync(join(file, '..'), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(temporary, file)
  } catch (error) {
    try { rmSync(temporary, { force: true }) } catch {}
    throw error
  }
}

/** Settings as the page may see them: every secret field is blanked, presence is flagged. */
function maskSettings(settings) {
  return {
    ...settings,
    channels: settings.channels.map((channel) => {
      const masked = { ...channel }
      const present = {}
      for (const field of SECRET_FIELDS[channel.type] ?? []) {
        present[field] = typeof channel[field] === 'string' && channel[field].length > 0
        masked[field] = ''
      }
      masked.hasSecret = present
      return masked
    }),
  }
}

/** Fields a channel still needs before it can deliver. */
function missingFields(channel) {
  return (REQUIRED_FIELDS[channel.type] ?? []).filter((field) => {
    const value = channel[field]
    return typeof value !== 'string' || value.trim().length === 0
  })
}

/** Trim a string to a byte budget without splitting a multi-byte character. */
function truncateBytes(text, limit) {
  if (Buffer.byteLength(text, 'utf8') <= limit) return text
  let result = ''
  let used = 0
  for (const character of text) {
    const size = Buffer.byteLength(character, 'utf8')
    if (used + size > limit) break
    result += character
    used += size
  }
  return result
}

/** Trim a string to a character budget, appending an ellipsis when shortened. */
function truncateChars(text, limit) {
  const value = String(text ?? '').trim()
  if (value.length <= limit) return value
  return `${value.slice(0, Math.max(0, limit - 1))}…`
}

/** Human-readable duration for notification bodies. */
function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000))
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    const rest = seconds % 60
    return rest === 0 ? `${minutes} 分钟` : `${minutes} 分 ${rest} 秒`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${minutes % 60} 分`
}

/** Wall-clock stamp in the host's local zone. */
function timestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** Concatenated text blocks of one assistant message. */
function messageText(message) {
  const content = message?.content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block != null && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n').trim()
}

/** Drop markdown emphasis so plain-text channels read cleanly. */
function toPlainText(markdown) {
  return markdown
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*---\s*$/gm, '')
    .trim()
}

/** POST JSON and return the parsed body, raising on transport and status failures. */
async function postJson(url, body, headers = {}, method = 'POST') {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const text = await response.text()
  let parsed
  try { parsed = text.length > 0 ? JSON.parse(text) : {} } catch { parsed = { raw: text } }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${truncateChars(text, 180)}`)
  }
  return parsed
}

/** Derive the SCMax host from a `scx-<uid>-...` key; an explicit base URL wins. */
function scmaxBase(channel) {
  if (typeof channel.baseUrl === 'string' && channel.baseUrl.trim().length > 0) {
    return channel.baseUrl.trim().replace(/\/+$/, '')
  }
  const match = /^scx-(\d+)-/.exec(typeof channel.key === 'string' ? channel.key : '')
  return match === null ? '' : `https://${match[1]}.max.ft07.com`
}

/** Compose the WeCom markdown body (untruncated; the sender splits it into messages). */
function wecomContent(message) {
  const sections = [`### ${message.title}`]
  if (message.desp.length > 0) sections.push(message.desp)
  if (message.tags.length > 0) {
    sections.push(message.tags.map((tag) => `<font color="comment">#${tag}</font>`).join(' '))
  }
  return sections.join('\n\n')
}

/**
 * Split a body into pieces that respect one channel's ceiling, breaking on line
 * boundaries first and cutting over-long single lines only as a last resort.
 * Truncation is a last resort for content past `maxChunks` messages.
 */
function splitBody(text, limit, chars) {
  const measure = chars
    ? (value) => value.length
    : (value) => Buffer.byteLength(value, 'utf8')
  if (measure(text) <= limit) return [text]
  const pieces = []
  let current = ''
  for (const line of text.split('\n')) {
    const candidate = current.length === 0 ? line : `${current}\n${line}`
    if (measure(candidate) <= limit) {
      current = candidate
      continue
    }
    if (current.length > 0) {
      pieces.push(current)
      current = ''
    }
    if (measure(line) <= limit) {
      current = line
      continue
    }
    let rest = line
    while (rest.length > 0) {
      let size = rest.length
      while (size > 0 && measure(rest.slice(0, size)) > limit) size = Math.floor(size * 0.8)
      if (size <= 0) size = 1
      const piece = rest.slice(0, size)
      rest = rest.slice(size)
      if (rest.length > 0) pieces.push(piece)
      else current = piece
    }
  }
  if (current.length > 0) pieces.push(current)
  return pieces
}

/** Trim to a byte budget and say so, so a reader knows the body continues elsewhere. */
function cutBytes(text, limit) {
  const cut = truncateBytes(text, limit)
  return cut.length === text.length ? cut : `${cut}\n\n…（内容较长，已截断）`
}

/** Split a body for one channel and mark the tail when the message budget runs out. */
function piecesFor(text, limit, chars) {
  const all = splitBody(text, limit, chars)
  const pieces = all.slice(0, MAX_CHUNKS)
  if (all.length > MAX_CHUNKS) {
    pieces[pieces.length - 1] = `${pieces[pieces.length - 1]}\n\n…（还有 ${all.length - MAX_CHUNKS} 段未发送）`
  }
  return pieces
}
/** Attach a `(i/n)` marker so a multi-message delivery reads in order. */
function withPartLabel(piece, index, total) {
  return total > 1 ? `（${index + 1}/${total}）\n${piece}` : piece
}

/** Deliver one message through one channel; resolves to a result record, never throws. */
async function deliver(channel, message) {
  const started = Date.now()
  // Channels without a native tag field get the tags appended to their text.
  const tagLine = message.tags.map((tag) => `#${tag}`).join(' ')
  try {
    if (channel.type === 'wecom') {
      const pieces = piecesFor(wecomContent(message), LIMITS.wecom.bytes, false)
      for (let index = 0; index < pieces.length; index++) {
        const result = await postJson(channel.webhook, {
          msgtype: 'markdown',
          markdown: { content: withPartLabel(pieces[index], index, pieces.length) },
        })
        if (result.errcode !== undefined && result.errcode !== 0) {
          throw new Error(`企业微信 errcode ${result.errcode}: ${result.errmsg ?? ''}`)
        }
      }
    } else if (channel.type === 'telegram') {
      const body = toPlainText(message.desp)
      const text = tagLine.length > 0 ? `${message.title}\n\n${body}\n\n${tagLine}` : `${message.title}\n\n${body}`
      const pieces = piecesFor(text, LIMITS.telegram.chars, true)
      for (let index = 0; index < pieces.length; index++) {
        const result = await postJson(`https://api.telegram.org/bot${channel.botToken}/sendMessage`, {
          chat_id: channel.chatId,
          text: withPartLabel(pieces[index], index, pieces.length),
          disable_web_page_preview: true,
        })
        if (result.ok !== true) throw new Error(`Telegram: ${result.description ?? 'rejected'}`)
      }
    } else if (channel.type === 'serverchan') {
      const desp = tagLine.length > 0 ? `${message.desp}\n\n${tagLine}` : message.desp
      const result = await postJson(`https://sctapi.ftqq.com/${channel.sendKey}.send`, {
        title: truncateChars(message.title, 32),
        desp: cutBytes(desp, LIMITS.serverchan.bytes),
      })
      const code = result.code ?? result.errno
      if (code !== undefined && code !== 0) throw new Error(`Server酱: ${result.message ?? code}`)
    } else if (channel.type === 'serverchan-max') {
      const base = scmaxBase(channel)
      if (base.length === 0) throw new Error('无法从 Key 推导域名，请填写服务器地址 / cannot derive host from key')
      const body = {
        title: truncateChars(message.title, 64),
        desp: cutBytes(message.desp, LIMITS['serverchan-max'].bytes),
        short: truncateChars(message.short, 160),
      }
      const tags = [...(channel.tags ?? []), ...message.tags]
      if (tags.length > 0) body.tags = [...new Set(tags)].slice(0, 8)
      await postJson(`${base}/v1/send`, body, { authorization: `Bearer ${channel.key}` })
    } else {
      throw new Error(`unknown channel type ${channel.type}`)
    }
    return { ok: true, ms: Date.now() - started }
  } catch (error) {
    return { ok: false, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Run one probe for a draft channel and return a machine-readable verdict the
 * page can localize: SCMax firewall/quota status, Telegram identity, or a shape
 * check for the two webhook kinds (which only answer on a real send).
 */
async function probeChannel(channel) {
  const missing = missingFields(channel)
  if (missing.length > 0) return { ok: false, code: 'missing', fields: missing }
  if (channel.type === 'serverchan-max') {
    const base = scmaxBase(channel)
    if (base.length === 0) return { ok: false, code: 'failed', detail: 'no server url' }
    const response = await fetch(`${base}/v1/firewall/status?key=${encodeURIComponent(channel.key ?? '')}`, {
      headers: { authorization: `Bearer ${channel.key ?? ''}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const text = await response.text()
    let parsed
    try { parsed = text.length > 0 ? JSON.parse(text) : {} } catch { parsed = {} }
    if (!response.ok) return { ok: false, code: 'failed', detail: `HTTP ${response.status} ${truncateChars(text, 160)}` }
    const quota = parsed?.key ?? {}
    return {
      ok: true,
      code: 'firewall',
      used: typeof quota.requests_24h === 'number' ? quota.requests_24h : undefined,
      limit: typeof quota.limit_24h === 'number' ? quota.limit_24h : undefined,
      blocked: quota.blocked === true,
    }
  }
  if (channel.type === 'telegram') {
    const response = await fetch(`https://api.telegram.org/bot${channel.botToken}/getMe`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const text = await response.text()
    let parsed
    try { parsed = text.length > 0 ? JSON.parse(text) : {} } catch { parsed = {} }
    if (!response.ok || parsed.ok !== true) {
      return { ok: false, code: 'failed', detail: truncateChars(parsed.description ?? text, 200) }
    }
    return { ok: true, code: 'telegram', detail: `@${parsed.result?.username ?? parsed.result?.first_name ?? 'bot'}` }
  }
  return { ok: true, code: 'shape-ok' }
}

export function apply(ctx, config) {
  const logger = ctx.logger
  let settings = loadSettings(logger)
  if (typeof config === 'object' && config !== null && Object.keys(config).length > 0) {
    // A row config in the profile patch seeds a store that does not exist yet.
    settings = normalizeSettings({ ...settings, ...config })
  }
  /** Latest delivery per channel, newest first, for the dialog. */
  const recent = []
  /** Per-session facts folded from the durable log. */
  const sessions = new Map()

  const remember = (record) => {
    recent.unshift(record)
    if (recent.length > MAX_RECENT) recent.length = MAX_RECENT
  }

  const sessionState = (session) => {
    const id = session.id
    let entry = sessions.get(id)
    if (entry === undefined) {
      entry = {
        id,
        title: '',
        cwd: typeof session.header?.cwd === 'string' ? session.header.cwd : '',
        subagent: session.header?.origin === 'subagent' || (session.header?.delegationDepth ?? 0) > 0,
        lastAssistantText: '',
        turnTexts: [],
        userText: '',
        turn: 0,
        turnStartedAt: 0,
      }
      sessions.set(id, entry)
      if (sessions.size > MAX_TRACKED_SESSIONS) {
        const oldest = sessions.keys().next()
        if (!oldest.done) sessions.delete(oldest.value)
      }
    }
    return entry
  }

  const workspaceName = (cwd) => {
    if (typeof cwd !== 'string' || cwd.length === 0) return ''
    const parts = cwd.split(/[\\/]+/).filter(Boolean)
    return parts.length === 0 ? cwd : parts[parts.length - 1]
  }

  const enabledChannels = () => (settings.enabled ? settings.channels.filter((channel) => channel.enabled) : [])

  const dispatch = async (message) => {
    const channels = enabledChannels()
    if (channels.length === 0) return []
    const settled = await Promise.all(channels.map(async (channel) => {
      const missing = missingFields(channel)
      if (missing.length > 0) {
        const record = { time: Date.now(), channel: channel.name, type: channel.type, ok: false, code: 'missing', fields: missing, title: message.title }
        remember(record)
        return record
      }
      const outcome = await deliver(channel, message)
      const record = { time: Date.now(), channel: channel.name, type: channel.type, title: message.title, ms: outcome.ms, ...(outcome.ok ? { ok: true } : { ok: false, error: outcome.error }) }
      remember(record)
      if (!outcome.ok) logger?.warn?.('notify-hub: %s delivery failed: %s', channel.name, outcome.error)
      return record
    }))
    return settled
  }

  /**
   * The reply section of a notification: every assistant text of the turn in
   * order (multi-step turns keep all steps), cut to the configured length.
   */
  const replyText = (entry) => {
    if (!settings.includePreview) return ''
    const steps = entry.turnTexts.length > 0 ? entry.turnTexts : [entry.lastAssistantText]
    const joined = steps
      .map((text) => String(text ?? '').replace(/\r/g, '').trim())
      .filter((text) => text.length > 0)
      .join('\n\n')
    if (joined.length === 0) return ''
    if (joined.length <= settings.previewChars) return joined
    return `${joined.slice(0, settings.previewChars)}\n\n…（共 ${joined.length} 字，已截断）`
  }

  const turnMessage = (entry, turnEvent, startedAtMs) => {
    const completed = turnEvent.reason.kind === 'completed'
    const head = completed ? '✅ 任务完成' : '⚠️ 任务未完成'
    const title = entry.title.length > 0 ? `${head} · ${truncateChars(entry.title, 40)}` : head
    const lines = []
    if (entry.title.length > 0) lines.push(`**会话**：${entry.title}`)
    const workspace = workspaceName(entry.cwd)
    if (workspace.length > 0) lines.push(`**工作区**：${workspace}`)
    if (startedAtMs > 0) lines.push(`**耗时**：${formatDuration(Date.now() - startedAtMs)} · 第 ${turnEvent.turn} 轮`)
    else lines.push(`**轮次**：第 ${turnEvent.turn} 轮`)
    if (!completed) {
      const reason = turnEvent.reason
      if (reason.kind === 'error') lines.push(`**错误**：${truncateChars(reason.error?.message ?? '未知错误', 400)}`)
      else lines.push(`**结束方式**：${reason.kind}`)
    }
    const asked = entry.userText.trim()
    if (asked.length > 0) {
      const oneLine = asked.replace(/\s*\n+\s*/g, ' ')
      lines.push(`**提问**：${truncateChars(oneLine, 300)}`)
    }
    const body = replyText(entry)
    if (body.length > 0) lines.push('', '---', body)
    return {
      title,
      desp: lines.join('\n'),
      short: body.length > 0 ? body.split('\n').find((line) => line.trim().length > 0) ?? '' : `${workspace} ${completed ? '已完成' : '未完成'}`,
      tags: ['dsh', completed ? '完成' : '异常'],
    }
  }

  const approvalMessage = (request) => {
    const entry = sessions.get(request.agent?.id)
    const reason = request.displayReason?.zh ?? request.displayReason?.en ?? request.reason ?? ''
    const lines = [`**工具**：\`${request.toolName}\``]
    if (request.displayReason !== undefined && typeof request.displayReason === 'object') {
      const localized = request.displayReason.zh ?? request.displayReason.en
      if (typeof localized === 'string' && localized.length > 0) lines.push(`**说明**：${truncateChars(localized, 200)}`)
    }
    if (entry?.title) lines.push(`**会话**：${entry.title}`)
    const workspace = workspaceName(entry?.cwd)
    if (workspace.length > 0) lines.push(`**工作区**：${workspace}`)
    if (typeof reason === 'string' && reason.length > 0 && !['', request.displayReason?.zh].includes(reason)) {
      lines.push(`**原因**：${truncateChars(reason, 200)}`)
    }
    return {
      title: `⏳ 需要审批 · ${truncateChars(request.toolName, 24)}`,
      desp: lines.join('\n'),
      short: `${request.toolName} 等待审批`,
      tags: ['dsh', '审批'],
    }
  }

  const questionMessage = (request) => {
    const entry = sessions.get(request.agent?.id)
    const first = Array.isArray(request.questions) ? request.questions[0] : undefined
    const text = typeof first?.question === 'string' ? first.question : (typeof first?.header === 'string' ? first.header : '')
    const lines = []
    if (text.length > 0) lines.push(truncateChars(text, 300))
    if (entry?.title) lines.push(`**会话**：${entry.title}`)
    const workspace = workspaceName(entry?.cwd)
    if (workspace.length > 0) lines.push(`**工作区**：${workspace}`)
    return {
      title: '❓ 需要回答',
      desp: lines.join('\n\n'),
      short: truncateChars(text, 100),
      tags: ['dsh', '提问'],
    }
  }

  ctx.on('session/event', (session, event) => {
    const entry = sessionState(session)
    switch (event.type) {
      case 'session/title': {
        const title = event.data?.title
        if (typeof title === 'string' && title.length > 0) entry.title = title
        break
      }
      case 'user/message': {
        const text = messageText(event.data)
        if (text.length > 0) entry.userText = text
        break
      }
      case 'assistant/message': {
        const text = messageText(event.data?.message)
        if (text.length > 0) {
          entry.lastAssistantText = text
          const turn = event.data?.turn
          if (typeof turn === 'number' && turn !== entry.turn && entry.turnTexts.length > 0) entry.turnTexts = []
          if (typeof turn === 'number') entry.turn = turn
          entry.turnTexts.push(text)
        }
        break
      }
      case 'turn/start': {
        entry.turn = event.data?.turn ?? entry.turn
        entry.turnStartedAt = Date.now()
        entry.turnTexts = []
        break
      }
      case 'turn/end': {
        const reason = event.data?.reason ?? { kind: 'completed' }
        const startedAt = entry.turnStartedAt
        entry.turnStartedAt = 0
        if (!settings.enabled) break
        if (settings.suppressSubagents && entry.subagent) break
        const failed = reason.kind === 'error' || reason.kind === 'max-tokens' || reason.kind === 'blocked'
        const completed = reason.kind === 'completed'
        if (completed && !settings.triggers.turnComplete) break
        if (failed && !settings.triggers.turnFailed) break
        if (!completed && !failed) break
        if (startedAt > 0 && (Date.now() - startedAt) / 1000 < settings.minTurnSeconds) break
        void dispatch(turnMessage(entry, { turn: event.data?.turn ?? entry.turn, reason }, startedAt)).catch(() => {})
        break
      }
      default:
        break
    }
  })

  // Waterfall listeners: notify, then hand the decision back to the composed answerers.
  ctx.on('approval/request', (request, next) => {
    if (settings.enabled && settings.triggers.approval) void dispatch(approvalMessage(request)).catch(() => {})
    return next()
  })

  ctx.on('user-questions/request', (request, next) => {
    if (settings.enabled && settings.triggers.question) void dispatch(questionMessage(request)).catch(() => {})
    return next()
  })

  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  const readBody = (req) => new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1_000_000) {
        req.destroy()
        resolve({ __error: 'request body too large' })
      }
    })
    req.on('end', () => {
      if (raw.length === 0) return resolve({})
      try { resolve(JSON.parse(raw)) } catch { resolve({ __error: 'malformed JSON body' }) }
    })
    req.on('error', () => { resolve({ __error: 'request body unreadable' }) })
  })

  /** Merge submitted channels over the stored ones so blank secrets keep their value. */
  const mergeChannels = (incoming) => {
    const stored = new Map(settings.channels.map((channel) => [channel.id, channel]))
    return incoming.map((channel) => {
      const previous = stored.get(channel.id)
      const merged = { ...channel }
      for (const field of SECRET_FIELDS[channel.type] ?? []) {
        if (typeof merged[field] !== 'string' || merged[field].trim().length === 0) {
          merged[field] = typeof previous?.[field] === 'string' ? previous[field] : ''
        }
      }
      return merged
    })
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: API_BASE,
    handler: async (req, res) => {
      const origin = req.headers.origin
      const host = req.headers.host
      // Same-origin only: the page that owns this harness is the only caller.
      if (typeof origin === 'string' && origin.length > 0 && host !== undefined) {
        try {
          if (new URL(origin).host !== host) return send(res, 403, { ok: false, error: { message: 'cross-origin request refused' } })
        } catch {
          return send(res, 403, { ok: false, error: { message: 'unreadable origin' } })
        }
      }
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: { message: 'POST required' } })
      const endpoint = (req.url ?? '').split('?')[0].split('/').filter(Boolean).pop() ?? ''
      const body = await readBody(req)
      if (body.__error !== undefined) return send(res, 400, { ok: false, error: { message: body.__error } })
      try {
        if (endpoint === 'state') {
          return send(res, 200, {
            ok: true,
            value: { settings: maskSettings(settings), recent, types: CHANNEL_TYPES, file: settingsFile() },
          })
        }
        if (endpoint === 'save') {
          const submitted = normalizeSettings(body.settings)
          submitted.channels = mergeChannels(submitted.channels)
          const warnings = []
          for (const channel of submitted.channels) {
            const missing = missingFields(channel)
            if (missing.length > 0) warnings.push({ name: channel.name, fields: missing })
          }
          saveSettings(submitted)
          settings = submitted
          return send(res, 200, { ok: true, value: { settings: maskSettings(settings), warnings } })
        }
        if (endpoint === 'test' || endpoint === 'check') {
          const draft = normalizeChannel(body.channel, 0)
          if (draft === undefined) return send(res, 400, { ok: false, error: { message: 'unknown channel' } })
          const [resolved] = mergeChannels([draft])
          const missing = missingFields(resolved)
          if (missing.length > 0) {
            return send(res, 200, { ok: true, value: { ok: false, code: 'missing', fields: missing } })
          }
          if (endpoint === 'check') return send(res, 200, { ok: true, value: await probeChannel(resolved) })
          const message = {
            title: '🔔 通知测试 · test',
            desp: `**时间 / time**：${timestamp()}\n\n这条消息来自 DeepSeek Harness 的通知插件，收到即表示该渠道可用。\n\nSent by the DeepSeek Harness notification plugin — receiving it means this channel works.`,
            short: '通知测试',
            tags: ['dsh', '测试'],
          }
          const outcome = await deliver(resolved, message)
          remember({
            time: Date.now(),
            channel: resolved.name,
            type: resolved.type,
            title: message.title,
            ms: outcome.ms,
            ...(outcome.ok ? { ok: true } : { ok: false, code: 'failed', detail: outcome.error }),
          })
          return send(res, 200, {
            ok: true,
            value: outcome.ok ? { ok: true, code: 'sent', ms: outcome.ms } : { ok: false, code: 'failed', detail: outcome.error },
          })
        }
        return send(res, 404, { ok: false, error: { message: `unknown endpoint ${endpoint}` } })
      } catch (error) {
        logger?.warn?.('notify-hub: %s failed: %s', endpoint, String(error))
        return send(res, 500, { ok: false, error: { message: error instanceof Error ? error.message : String(error) } })
      }
    },
  }), 'notify-hub: settings api')

  logger?.info?.('notify-hub ready: %d channel(s), settings at %s', settings.channels.length, settingsFile())
}
