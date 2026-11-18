/** Optional delivery adapters. All credentials stay on the host. No dependencies. */
import { createHmac } from 'node:crypto'

export const EXTRA_CHANNEL_TYPES = ['feishu', 'dingtalk', 'bark', 'ntfy', 'discord', 'slack', 'pushplus', 'gotify', 'webhook']
export const EXTRA_SECRET_FIELDS = {
  feishu: ['webhook', 'signSecret'],
  dingtalk: ['webhook', 'signSecret'],
  bark: ['deviceKey'],
  ntfy: ['accessToken'],
  discord: ['webhook'],
  slack: ['webhook'],
  pushplus: ['token'],
  gotify: ['appToken'],
  webhook: ['webhook', 'authToken'],
}
export const EXTRA_REQUIRED_FIELDS = {
  feishu: ['webhook'],
  dingtalk: ['webhook'],
  bark: ['deviceKey'],
  ntfy: ['topic'],
  discord: ['webhook'],
  slack: ['webhook'],
  pushplus: ['token'],
  gotify: ['baseUrl', 'appToken'],
  webhook: ['webhook'],
}

const TIMEOUT_MS = 10000
const MAX_PARTS = 12
function endpoint(value, fallback = '') {
  const url = new URL(String(value || fallback))
  // Redirects are disabled below to avoid leaking webhook tokens to a new host.
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid HTTP(S) endpoint URL')
  }
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('HTTPS is required for remote endpoints')
  }
  return url
}
function plain(value) {
  return String(value || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s*/gm, '').trim()
}
function messageBody(message) {
  const tags = (message.tags || []).map((tag) => `#${tag}`).join(' ')
  return `${message.title}\n\n${plain(message.desp)}${tags ? `\n\n${tags}` : ''}`
}
function parts(text, maxChars) {
  const all = []
  // Iterate by code point so emoji are not split in the middle of a surrogate pair.
  let chunk = ''
  for (const char of text) {
    if (chunk.length + char.length > maxChars) {
      all.push(chunk)
      chunk = ''
    }
    chunk += char
  }
  if (chunk) all.push(chunk)
  const selected = all.slice(0, MAX_PARTS)
  if (all.length > MAX_PARTS) selected[selected.length - 1] = selected[selected.length - 1].slice(0, maxChars - 32) + '\n…（更多内容未发送）'
  return selected.map((part, i) => selected.length > 1 ? `(${i + 1}/${selected.length})\n${part}` : part)
}
async function request(url, json, headers = {}, raw = false) {
  const target = endpoint(url)
  const response = await fetch(target, {
    method: 'POST',
    redirect: 'error',
    headers: { 'content-type': raw ? 'text/plain; charset=utf-8' : 'application/json', ...headers },
    body: raw ? String(json) : JSON.stringify(json),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const text = await response.text()
  // Never expose an upstream response body that might reflect an access token.
  if (!response.ok) throw new Error(`HTTP ${response.status} from notification endpoint`)
  try { return JSON.parse(text) } catch { return { raw: text.slice(0, 100) } }
}
function checkCode(value, type, accepted = [0]) {
  const code = value?.code ?? value?.errcode
  if (code !== undefined && !accepted.includes(code)) throw new Error(`${type} rejected the request (code ${code})`)
}
function signFeishu(secret, timestamp) {
  return createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64')
}
function signDingtalk(secret, timestamp) {
  return createHmac('sha256', secret).update(`${timestamp}\n${secret}`).digest('base64')
}
function host(base, fallback) {
  const url = endpoint(base, fallback)
  // Dedicated self-hosted service URL, not a preconfigured message endpoint.
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/, '')
}
export async function deliverExtra(channel, message) {
  const body = messageBody(message)
  const type = channel.type
  if (type === 'feishu') {
    for (const part of parts(body, 3500)) {
      const data = { msg_type: 'text', content: { text: part } }
      if (channel.signSecret) {
        data.timestamp = String(Math.floor(Date.now() / 1000))
        data.sign = signFeishu(channel.signSecret, data.timestamp)
      }
      checkCode(await request(channel.webhook, data), 'Feishu')
    }
  } else if (type === 'dingtalk') {
    const target = endpoint(channel.webhook)
    if (channel.signSecret) {
      const timestamp = String(Date.now())
      target.searchParams.set('timestamp', timestamp)
      target.searchParams.set('sign', signDingtalk(channel.signSecret, timestamp))
    }
    for (const part of parts(body, 3500)) {
      checkCode(await request(target, { msgtype: 'text', text: { content: part } }), 'DingTalk')
    }
  } else if (type === 'bark') {
    const base = host(channel.baseUrl, 'https://api.day.app')
    for (const part of parts(plain(message.desp), 3500)) {
      const result = await request(`${base}/push`, { device_key: channel.deviceKey, title: message.title, body: part, group: 'dsh-notify-hub' })
      checkCode(result, 'Bark', [200])
    }
  } else if (type === 'ntfy') {
    const base = host(channel.baseUrl, 'https://ntfy.sh')
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(channel.topic ?? '')) throw new Error('Invalid ntfy topic')
    const headers = { Title: encodeURIComponent(message.title), Tags: 'bell' }
    if (channel.accessToken) headers.Authorization = `Bearer ${channel.accessToken}`
    for (const part of parts(body, 3500)) await request(`${base}/${channel.topic}`, part, headers, true)
  } else if (type === 'discord') {
    for (const part of parts(body, 1800)) await request(channel.webhook, { content: part, allowed_mentions: { parse: [] } })
  } else if (type === 'slack') {
    for (const part of parts(body, 3500)) {
      const result = await request(channel.webhook, { text: part })
      if (result.raw && result.raw !== 'ok') throw new Error('Slack rejected the webhook')
    }
  } else if (type === 'pushplus') {
    const result = await request('https://www.pushplus.plus/send', {
      token: channel.token,
      title: message.title,
      content: message.desp,
      template: 'markdown',
    })
    checkCode(result, 'PushPlus', [200])
  } else if (type === 'gotify') {
    const base = host(channel.baseUrl)
    for (const part of parts(body, 3500)) {
      await request(`${base}/message`, { title: message.title, message: part, priority: 5 }, { 'X-Gotify-Key': channel.appToken })
    }
  } else if (type === 'webhook') {
    const headers = channel.authToken ? { Authorization: `Bearer ${channel.authToken}` } : {}
    await request(channel.webhook, {
      title: message.title, body: message.desp, summary: message.short,
      tags: message.tags, source: 'dsh-notify-hub',
    }, headers)
  } else {
    throw new Error('Unsupported notification channel')
  }
}
