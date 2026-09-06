import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { decompress, decode, parseCSV } from '../../core/dist/index.js'
const rows = []
let metadata
if (process.argv[2]) {
  const start = performance.now(), cpu = process.cpuUsage()
  metadata = parseCSV(new TextDecoder().decode(decompress(new Uint8Array(readFileSync(process.argv[2])), '.csv')))
  rows.push({ stage: 'metadata-parse', wallMs: performance.now() - start, cpuMicros: process.cpuUsage(cpu), jsonBytes: Buffer.byteLength(JSON.stringify(metadata)), memory: process.memoryUsage() })
}
for (const id of ['047927', '000789']) {
  const f = JSON.parse(readFileSync(new URL(`../tests/fixtures/${id}.json`, import.meta.url)))
  const zip = new Uint8Array(Buffer.from(f.zipBase64, 'base64'))
  const start = performance.now(), cpu = process.cpuUsage()
  const raw = decompress(zip, '.txt', { maxOutputBytes: 16 * 1024 * 1024 })
  const text = decode(raw)
  rows.push({ id, zipBytes: zip.length, outputBytes: raw.length, textBytes: Buffer.byteLength(text), wallMs: performance.now() - start, cpuMicros: process.cpuUsage(cpu), memory: process.memoryUsage() })
}
console.log(JSON.stringify({ runtime: process.version, scope: 'Node local process; not Workers CPU or isolate peak memory', peakRssKiB: process.resourceUsage().maxRSS, rows }, null, 2))
