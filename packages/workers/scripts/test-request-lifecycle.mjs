// Real HTTP sockets into local workerd; no remote bindings or credentials.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
const require = createRequire(import.meta.url)
const dependency = createRequire(require.resolve('wrangler/package.json'))
const { build } = await import(dependency.resolve('esbuild'))
const { Miniflare, convertV4MiniflareOptions } = await import(dependency.resolve('miniflare'))
const temporary = await mkdtemp(join(tmpdir(), 'aozora-disconnect-'))
const workerPath = join(temporary, 'worker.js')
await build({ entryPoints: [new URL('../tests/http/lifecycle-worker.ts', import.meta.url).pathname], outfile: workerPath, bundle: true, format: 'esm', platform: 'browser', external: ['cloudflare:*'] })
const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/047927.json', import.meta.url), 'utf8'))
const zip = Buffer.from(fixture.zipBase64, 'base64')
const metadata = JSON.stringify({ works: [fixture.metadata], persons: [], syncedAt: '2026-09-06T00:00:00Z' })
const rows = []
function socket(url) {
  let req
  const response = new Promise((resolve, reject) => {
    req = httpRequest(url, { agent: false }, incoming => {
      const chunks = []
      incoming.on('data', chunk => chunks.push(chunk))
      incoming.on('end', () => resolve({ status: incoming.statusCode, text: Buffer.concat(chunks).toString() }))
      incoming.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
  response.catch(() => {})
  return { response, async disconnect() {
    const closed = new Promise(resolve => req.once('close', resolve))
    req.destroy(new Error('Intentional owner disconnect'))
    await closed
  } }
}
async function until(check, message) {
  const end = Date.now() + 5000
  while (!(await check())) {
    if (Date.now() > end) throw new Error(message)
    await delay(10)
  }
}
try {
  for (const timing of ['after-disconnect', 'before-disconnect']) for (const phase of ['metadata-kv', 'metadata-r2', 'metadata-body', 'content-kv', 'content-r2', 'content-body', 'origin', 'origin-body', 'origin-timeout']) {
    let entered = false, released = false, origins = 0
    let release
    const barrier = new Promise(resolve => { release = () => { released = true; resolve() } })
    const mf = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', port: 0, unsafeDirectSockets: [{ host: '127.0.0.1', port: 0 }], modules: true, modulesRoot: temporary, scriptPath: workerPath, compatibilityDate: '2026-01-01', kvNamespaces: ['KV'], r2Buckets: ['R2'], bindings: { RETAIN_TASKS: process.argv.includes('--without-retention') ? 'false' : 'true', PHASE: phase, CONTENT_MAX_CONCURRENT: '1', CONTENT_TIMEOUT_MS: phase === 'origin-timeout' ? '300' : '20000' }, serviceBindings: { GATE: async () => { entered = true; await barrier; return new Response('released') } }, outboundService: async request => {
      assert.equal(request.url, fixture.metadata.sourceUrls.text)
      origins++
      if (phase === 'origin-body') return new Response(new ReadableStream({ async start(controller) {
        controller.enqueue(zip.subarray(0, 100)); entered = true; await barrier; controller.enqueue(zip.subarray(100)); controller.close()
      } }))
      if (phase.startsWith('origin') && !released) { entered = true; await barrier }
      return new Response(zip)
    } }))
    let first, second
    try {
      const base = (await mf.unsafeGetDirectURL()).origin
      const kv = await mf.getKVNamespace('KV'), r2 = await mf.getR2Bucket('R2')
      await r2.put('metadata/all.json', metadata)
      if (phase.startsWith('content') || phase.startsWith('origin')) {
        await kv.put('meta:works', JSON.stringify([fixture.metadata])); await kv.put('meta:persons', '[]')
      }
      const savedZip = phase === 'content-r2' || phase === 'content-body'
      if (savedZip) await r2.put(new URL(fixture.metadata.sourceUrls.text).pathname.slice(1), zip)
      const path = phase.startsWith('metadata') ? '/v1/works' : '/v1/works/047927/content?format=raw'
      first = socket(base + path)
      await until(() => entered, `${phase}: owner never reached barrier`)
      const before = await (await fetch(base + '/__status')).json()
      if (timing === 'after-disconnect') { await first.disconnect(); await delay(100) }
      second = socket(base + path)
      await until(async () => (await (await fetch(base + '/__status')).json()).retained > before.retained, `${phase}: follower did not retain shared work`)
      if (!phase.startsWith('metadata')) assert.equal((await fetch(base + '/__slot')).status, 503)
      if (timing === 'before-disconnect') await first.disconnect() // Close only the creator's actual TCP connection.
      await delay(100) // Give workerd a chance to observe cancellation while I/O remains blocked.
      if (phase !== 'origin-timeout') release()
      const result = await Promise.race([second.response, delay(6000).then(() => { throw new Error(`${phase}: follower hung`) })])
      const expected = phase === 'origin-timeout' ? 500 : 200
      assert.equal(result.status, expected, result.text)
      if (phase === 'origin-timeout') {
        assert.deepEqual(JSON.parse(result.text), { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } })
        release()
        await kv.put('content:047927', fixture.text)
      }
      if (expected === 200 && !phase.startsWith('metadata')) assert.equal(JSON.parse(result.text).content, fixture.text)
      assert.equal((await fetch(base + '/__slot')).status, 200)
      const retry = await fetch(base + path)
      assert.equal(retry.status, 200)
      await retry.arrayBuffer()
      assert.equal(origins, phase.startsWith('metadata') || savedZip ? 0 : 1)
      rows.push({ timing, phase, ownerSocketClosed: true, follower: expected, retry: 200, slot: 200, origins })
      console.log('PASS', timing, phase)
    } finally {
      release()
      await mf.dispose()
    }
  }
  console.log(JSON.stringify({ runtime: 'local workerd over separate HTTP sockets', rows }, null, 2))
} finally { await rm(temporary, { recursive: true, force: true }) }
