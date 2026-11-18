import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { EXTRA_CHANNEL_TYPES, EXTRA_REQUIRED_FIELDS, EXTRA_SECRET_FIELDS, deliverExtra } from '../channels.js'

const notification = { title: 'Task completed', desp: '**Result**\nAll good', short: 'Success', tags: ['dsh'] }

async function capture(type, channel, reply = '{}') {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return { ok: true, status: 200, text: async () => reply }
  }
  try { await deliverExtra({ type, ...channel }, notification) }
  finally { globalThis.fetch = previous }
  return calls
}

test('metadata covers every new channel', () => {
  assert.equal(EXTRA_CHANNEL_TYPES.length, 9)
  for (const type of EXTRA_CHANNEL_TYPES) {
    assert.ok(EXTRA_REQUIRED_FIELDS[type].length)
    assert.ok(Array.isArray(EXTRA_SECRET_FIELDS[type]))
  }
})

test('Feishu uses the official text payload and HMAC signed body', async () => {
  const calls = await capture('feishu', { webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/test', signSecret: 'SEC-test' }, '{"code":0}')
  assert.equal(calls.length, 1)
  const sent = JSON.parse(calls[0].options.body)
  assert.equal(sent.msg_type, 'text')
  assert.match(sent.content.text, /Task completed/)
  assert.equal(sent.sign, createHmac('sha256', `${sent.timestamp}\nSEC-test`).update('').digest('base64'))
})

test('DingTalk signs its URL and sends no @mentions', async () => {
  const calls = await capture('dingtalk', { webhook: 'https://oapi.dingtalk.com/robot/send?access_token=abc', signSecret: 'SEC-test' }, '{"errcode":0}')
  const url = new URL(calls[0].url)
  const ts = url.searchParams.get('timestamp')
  assert.equal(url.searchParams.get('sign'), createHmac('sha256', 'SEC-test').update(`${ts}\nSEC-test`).digest('base64'))
  assert.equal(JSON.parse(calls[0].options.body).msgtype, 'text')
})

test('Bark, ntfy, Discord, Slack, PushPlus, Gotify and webhook payloads', async () => {
  const specs = [
    ['bark', { deviceKey: 'dev-key' }, 'https://api.day.app/push', '{"code":200}'],
    ['ntfy', { topic: 'topic-1', accessToken: 'tk_test' }, 'https://ntfy.sh/topic-1', '{}'],
    ['discord', { webhook: 'https://discord.com/api/webhooks/test/token' }, 'https://discord.com/api/webhooks/test/token', ''],
    ['slack', { webhook: 'https://hooks.slack.com/services/test' }, 'https://hooks.slack.com/services/test', 'ok'],
    ['pushplus', { token: 'test' }, 'https://www.pushplus.plus/send', '{"code":200}'],
    ['gotify', { baseUrl: 'https://gotify.example.net', appToken: 'token' }, 'https://gotify.example.net/message', '{}'],
    ['webhook', { webhook: 'https://example.org/api', authToken: 'secret' }, 'https://example.org/api', '{}'],
  ]
  for (const [type, settings, url, reply] of specs) {
    const calls = await capture(type, settings, reply)
    assert.equal(calls[0].url, url, `${type} endpoint`)
    assert.equal(calls[0].options.redirect, 'error', `${type} must disable redirects`)
  }
})

test('Discord avoids unwanted mentions and splits long messages', async () => {
  const previous = globalThis.fetch
  const calls = []
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body))
    return { ok: true, status: 204, text: async () => '' }
  }
  try {
    await deliverExtra({ type: 'discord', webhook: 'https://discord.com/api/webhooks/1/key' }, { ...notification, desp: 'a'.repeat(7000) })
  } finally { globalThis.fetch = previous }
  assert.ok(calls.length >= 4)
  assert.ok(calls.every(({ content, allowed_mentions }) => content.length <= 2000 && allowed_mentions.parse.length === 0))
})

test('remote plain HTTP is rejected', async () => {
  await assert.rejects(deliverExtra({ type: 'webhook', webhook: 'http://example.org/api' }, notification), /HTTPS is required/)
})

test('channel API errors are caught', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '{"errcode":310000}' })
  try { await assert.rejects(deliverExtra({ type: 'dingtalk', webhook: 'https://oapi.dingtalk.com/robot/send?access_token=abc' }, notification), /rejected/) }
  finally { globalThis.fetch = previous }
})
