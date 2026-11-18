import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { apply } from '../index.js'

async function call(handler, path, data = {}) {
  const req = new EventEmitter()
  req.method = 'POST'
  req.url = `/dsh-notify-hub-api/${path}`
  req.headers = { host: 'localhost:3000', origin: 'http://localhost:3000' }
  const res = {
    statusCode: 0,
    setHeader() {},
    writeHead(code) { this.statusCode = code },
    end(body) { this.body = body },
  }
  const promise = handler(req, res)
  queueMicrotask(() => { req.emit('data', JSON.stringify(data)); req.emit('end') })
  await promise
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

test('new credentials are masked and retained across blank-secret save', async () => {
  const originalHome = process.env.DSH_HOME
  const home = mkdtempSync(join(tmpdir(), 'dsh-notify-'))
  try {
    process.env.DSH_HOME = home
    mkdirSync(join(home, 'notify-hub'))
    writeFileSync(join(home, 'notify-hub', 'settings.json'), JSON.stringify({
      version: 2, channels: [
        { id: 'f1', type: 'feishu', name: 'test', enabled: true, webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/abc', signSecret: 'SECRET' },
        { id: 'n1', type: 'ntfy', name: 'ntfy', enabled: true, topic: 'private-topic', accessToken: 'TOKEN' },
      ],
    }))
    let handler
    const ctx = { logger: {}, on() {}, effect(cb) { cb() }, webServer: { register({ handler: fn }) { handler = fn } } }
    apply(ctx, {})
    const first = await call(handler, 'state')
    assert.equal(first.status, 200)
    assert.ok(first.body.value.types.includes('feishu'))
    assert.ok(first.body.value.types.includes('webhook'))
    const feishu = first.body.value.settings.channels[0]
    assert.equal(feishu.webhook, '')
    assert.equal(feishu.signSecret, '')
    assert.equal(feishu.hasSecret.webhook, true)
    assert.equal(feishu.hasSecret.signSecret, true)
    const ntfy = first.body.value.settings.channels[1]
    assert.equal(ntfy.accessToken, '')
    assert.equal(ntfy.hasSecret.accessToken, true)

    const saved = await call(handler, 'save', { settings: first.body.value.settings })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.value.settings.channels[0].hasSecret.signSecret, true)
    assert.equal(saved.body.value.settings.channels[1].hasSecret.accessToken, true)
  } finally {
    if (originalHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = originalHome
    rmSync(home, { recursive: true, force: true })
  }
})
