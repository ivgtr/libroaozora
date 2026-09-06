// Local disposable bindings only. No Cloudflare credentials or production writes.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { performance } from 'node:perf_hooks'
import { decompress, parseCSV, sha256, sourceRevision } from '../../core/dist/index.js'
const require = createRequire(import.meta.url)
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'))
const { Miniflare, convertV4MiniflareOptions } = await import(wranglerRequire.resolve('miniflare'))
const [workerPath, csvZip] = process.argv.slice(2)
if (!workerPath || !csvZip) throw new Error('Usage: node scripts/measure-worker.mjs <dry-run worker.js> <local CSV ZIP>')
const metadata = { ...parseCSV(new TextDecoder().decode(decompress(new Uint8Array(readFileSync(csvZip)), '.csv'))), syncedAt: new Date().toISOString() }
const versioned = process.argv.includes("--v2")
const snapshot = { schemaVersion: 1, generation: "measurement", ...metadata }
const json = JSON.stringify(versioned ? snapshot : metadata)
const fixtures = ['047927', '000789'].map(id => JSON.parse(readFileSync(new URL(`../tests/fixtures/${id}.json`, import.meta.url))))
let fetches = 0
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, modulesRoot: dirname(workerPath), scriptPath: workerPath, compatibilityDate: '2026-01-01', kvNamespaces: ['KV'], r2Buckets: ['R2'], outboundService: async request => {
  fetches++
  const fixture = fixtures.find(f => f.metadata.sourceUrls.text === request.url)
  if (!fixture) throw new Error(`Unexpected origin: ${request.url}`)
  return new Response(Buffer.from(fixture.zipBase64, 'base64'))
} }))
try {
  const kv = await mf.getKVNamespace('KV'), r2 = await mf.getR2Bucket('R2')
  if (versioned) {
    await r2.put("metadata/snapshots/measurement.json", json)
    await r2.put("metadata/current.json", JSON.stringify({ schemaVersion: 1, current: { generation: "measurement", digest: await sha256(json) }, previous: null }))
  }
  const rows = []
  for (const stage of ['cold', 'kv', 'r2', 'concurrent-cold']) {
    if (stage === 'cold' || stage === 'concurrent-cold') {
      for (const key of ['meta:works', 'meta:persons', 'meta:syncedAt']) await kv.delete(key)
    }
    await r2.put('metadata/all.json', json)
    for (const f of fixtures) {
      const work = metadata.works.find(work => work.id === f.metadata.id)
      const revision = await sourceRevision(work)
      if (stage !== 'kv') await kv.delete(versioned ? `content:v2:${work.id}:${revision}` : `content:${work.id}`)
      if (stage === 'cold' || stage === 'concurrent-cold') await r2.delete(versioned ? `content/v2/${work.id}/${revision}.zip` : new URL(work.sourceUrls.text).pathname.slice(1))
    }
    const run = async f => {
      const start = performance.now()
      const response = await mf.dispatchFetch(`http://local/v1/works/${f.metadata.id}/content?format=raw`)
      const body = await response.json()
      if (response.status !== 200 || !body.content) throw new Error(JSON.stringify(body))
      return { id: f.metadata.id, status: response.status, cache: response.headers.get('X-Cache-Status'), bytes: Buffer.byteLength(body.content), wallMs: performance.now() - start }
    }
    const before = fetches
    const values = stage === 'concurrent-cold' ? await Promise.all(fixtures.map(run)) : [await run(fixtures[0]), await run(fixtures[1])]
    rows.push({ stage, fetches: fetches - before, values })
  }
  console.log(JSON.stringify({ runtime: 'local workerd via Miniflare', versioned, metadataBytes: Buffer.byteLength(json), works: metadata.works.length, persons: metadata.persons.length, cpu: 'not measured', isolatePeakMemory: 'not measured', rows }, null, 2))
} finally { await mf.dispose() }
