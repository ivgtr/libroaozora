import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { publishSnapshot } from '/home/ivgtr/pj/aozora/libroaozora/packages/workers/scripts/metadata-sync.ts'
const workerRoot = '/home/ivgtr/pj/aozora/libroaozora/packages/workers/'
const require = createRequire(workerRoot + 'package.json')
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'))
const { Miniflare, convertV4MiniflareOptions } = await import(wranglerRequire.resolve('miniflare'))
const fixtures = ['047927', '000789'].map(id => JSON.parse(readFileSync(workerRoot + `tests/fixtures/${id}.json`, 'utf8')))
const source = readFileSync('/tmp/official-origin-step2/d-worker/index.js', 'utf8')
let revised = false, fail = false, fetches = 0, reloads = 0
const options = () => convertV4MiniflareOptions({ host: '127.0.0.1', port: 9797, modules: true, script: source + `\n// isolate ${reloads}`, compatibilityDate: '2026-01-01', kvNamespaces: ['KV'], r2Buckets: ['R2'], outboundService: async (request: Request) => {
  fetches++
  const fixture = fixtures.find(f => f.metadata.sourceUrls.text === request.url)
  if (!fixture) return new Response(null, { status: 404 })
  if (fail && fixture.metadata.id === '047927') return new Response(null, { status: 503 })
  return new Response(revised && fixture.metadata.id === '047927' ? readFileSync('/tmp/official-origin-step2/revised47927.zip') : Buffer.from(fixture.zipBase64, 'base64'))
} })
const mf = new Miniflare(options())
let r2 = await mf.getR2Bucket('R2'), kv = await mf.getKVNamespace('KV')
const store = { readR2: async (key: string) => { const object = await r2.get(key); return object?.text() ?? null }, writeR2: async (key: string, value: string) => { await r2.put(key, value) }, writeKV: async (key: string, value: string, ttl: number) => { await kv.put(key, value, { expirationTtl: ttl }) } }
let generation = 1
const publish = async (withdrawn = false) => {
  const works = fixtures.map(f => ({ ...f.metadata, copyrightFlag: f.metadata.id === '047927' && withdrawn, textSource: { updatedAt: revised ? '2026-09-06' : '2013-08-08', revisionCount: revised ? 1 : 0 } }))
  await publishSnapshot(store, { schemaVersion: 1, generation: `browser-${generation}`, works, persons: [], syncedAt: new Date(Date.now() - 10000 + generation * 1000).toISOString() })
}
await publish()
const admin = createServer(async (request, response) => {
  try {
    if (request.method === 'POST') {
      if (request.url === '/revise') { revised = true; fail = true; generation++; await publish() }
      if (request.url === '/recover') fail = false
      if (request.url === '/withdraw') { generation++; await publish(true) }
      reloads++
      await mf.setOptions(options()) // Simulate another isolate observing the new pointer.
      r2 = await mf.getR2Bucket('R2'); kv = await mf.getKVNamespace('KV')
    }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ revised, fail, fetches, generation }))
  } catch (error) { console.error(error); response.statusCode = 500; response.end('harness failed') }
})
admin.listen(9798, '127.0.0.1', () => console.log('LOCAL HARNESS READY'))
const stop = async () => { admin.close(); await mf.dispose(); process.exit(0) }
process.on('SIGTERM', stop); process.on('SIGINT', stop)
