import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { env } from "cloudflare:workers"
import { sha256 } from "@libroaozora/core"
import { getMetadata, getPreviousWork, getWorks, getPersons, resetMetadataForTesting } from "../../src/services/metadata"
import { CURRENT_KEY, MIGRATED_KEY, MIGRATED_VALUE, snapshotKey, metadataKey } from "../../src/services/metadata-model"
import { METADATA_R2_KEY, META_WORKS_KEY } from "../../src/lib/constants"
import { SEED_WORKS, SEED_PERSONS, SEED_METADATA_JSON } from "../fixtures/seed"

beforeEach(async () => {
  resetMetadataForTesting()
  await env.R2.delete(CURRENT_KEY)
  await env.R2.delete(MIGRATED_KEY)
  await env.R2.delete(METADATA_R2_KEY)
  for (const id of ["current", "previous"]) { await env.KV.delete(metadataKey(id)); await env.R2.delete(snapshotKey(id)) }
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
async function snapshot(generation: string, works = SEED_WORKS) {
  const text = JSON.stringify({ schemaVersion: 1, generation, works, persons: SEED_PERSONS, syncedAt: "2026-09-06T00:00:00Z" })
  await env.R2.put(snapshotKey(generation), text)
  return { generation, digest: await sha256(text) }
}
it("uses legacy R2 only when current is confirmed absent, ignoring mixed legacy KV", async () => {
  await env.KV.put(META_WORKS_KEY, "[]")
  await env.R2.put(METADATA_R2_KEY, SEED_METADATA_JSON)
  expect(await getMetadata(env)).toMatchObject({ works: SEED_WORKS, persons: SEED_PERSONS, state: "legacy", validatedAt: null })
  expect(await getWorks(env)).toEqual(SEED_WORKS)
  expect(await getPersons(env)).toEqual(SEED_PERSONS)
})
it("ignores invalid or missing generation KV and reads the same generation from R2", async () => {
  const current = await snapshot("current")
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current, previous: null }))
  await env.KV.put(metadataKey("current"), "invalid")
  expect(await getMetadata(env)).toMatchObject({ generation: "current", state: "current", works: SEED_WORKS })
})
it("explicitly falls back to the previous snapshot without combining data", async () => {
  const current = await snapshot("current", [])
  const previous = await snapshot("previous")
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current, previous }))
  await env.R2.delete(snapshotKey("current"))
  expect(await getMetadata(env)).toMatchObject({ generation: "previous", works: SEED_WORKS, state: "previous", validatedAt: null })
})
it("does not resurrect deleted works from previous metadata", async () => {
  const current = await snapshot("current", [])
  const previous = await snapshot("previous")
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current, previous }))
  expect((await getMetadata(env)).works).toEqual([])
})
it("honors the 60-second pointer interval and never advances validatedAt on a cache hit", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  const current = await snapshot("current")
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current, previous: null }))
  const first = await getMetadata(env)
  vi.setSystemTime(Date.now() + 59_999)
  expect((await getMetadata(env)).validatedAt).toBe(first.validatedAt)
  vi.setSystemTime(Date.now() + 1)
  expect((await getMetadata(env)).validatedAt).not.toBe(first.validatedAt)
})
it("rejects a malformed pointer at cold start instead of guessing legacy", async () => {
  await env.R2.put(METADATA_R2_KEY, SEED_METADATA_JSON)
  await env.R2.put(CURRENT_KEY, "invalid")
  const del = vi.spyOn(env.R2, "delete")
  await expect(getMetadata(env)).rejects.toHaveProperty("status", 503)
  expect(del).not.toHaveBeenCalled()
})
it("uses last-known data unverified after a pointer transport failure", async () => {
  const current = await snapshot("current")
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current, previous: null }))
  await getMetadata(env)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(Date.now() + 60_001)
  vi.spyOn(env.R2, "get").mockRejectedValue(new Error("network"))
  expect(await getMetadata(env)).toMatchObject({ generation: "current", state: "previous", validatedAt: null })
})
it("KV exceptions do not prevent loading metadata and R2 body failures never delete data", async () => {
  const current = await snapshot("current")
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current, previous: null }))
  vi.spyOn(env.KV, "get").mockRejectedValue(new Error("KV down"))
  expect((await getMetadata(env)).works).toEqual(SEED_WORKS)
  resetMetadataForTesting()
  const object = (await env.R2.get(CURRENT_KEY))!
  vi.spyOn(object, "text").mockRejectedValue(new Error("body failure"))
  vi.spyOn(env.R2, "get").mockResolvedValue(object)
  const del = vi.spyOn(env.R2, "delete")
  await expect(getMetadata(env)).rejects.toHaveProperty("status", 503)
  expect(del).not.toHaveBeenCalled()
})

it("never reopens legacy permission after observing a withdrawn v2 work", async () => {
  const stopped = SEED_WORKS.map(work => ({ ...work, copyrightFlag: true }))
  const current = await snapshot("current", stopped)
  await env.R2.put(METADATA_R2_KEY, SEED_METADATA_JSON)
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current, previous: null }))
  expect((await getMetadata(env)).works[0].copyrightFlag).toBe(true)
  await env.R2.delete(CURRENT_KEY)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(Date.now() + 60_001)
  const get = vi.spyOn(env.R2, "get")
  expect(await getMetadata(env)).toMatchObject({ generation: "current", state: "previous", validatedAt: null, works: stopped })
  expect(get.mock.calls.some(([key]) => key === METADATA_R2_KEY)).toBe(false)
})
it.each(["cold", "previously-legacy"])("blocks legacy after durable migration in a %s isolate", async mode => {
  await env.R2.put(METADATA_R2_KEY, SEED_METADATA_JSON)
  if (mode === "previously-legacy") expect((await getMetadata(env)).state).toBe("legacy")
  await env.R2.put(MIGRATED_KEY, MIGRATED_VALUE)
  const get = vi.spyOn(env.R2, "get")
  await expect(getMetadata(env)).rejects.toHaveProperty("status", 503)
  expect(get.mock.calls.some(([key]) => key === METADATA_R2_KEY)).toBe(false)
})
it("fails closed when the migration marker cannot be checked", async () => {
  await env.R2.put(METADATA_R2_KEY, SEED_METADATA_JSON)
  const get = env.R2.get.bind(env.R2)
  vi.spyOn(env.R2, "get").mockImplementation((key, options) => {
    if (key === MIGRATED_KEY) return Promise.reject(new Error("marker unavailable"))
    return get(key, options)
  })
  await expect(getMetadata(env)).rejects.toHaveProperty("status", 503)
})
it("does not return G1 outside a successfully read G3/G2 pointer, even on later transport failure", async () => {
  const g1 = await snapshot("g1")
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current: g1, previous: null }))
  expect((await getMetadata(env)).generation).toBe("g1")
  const g2 = await snapshot("g2", [])
  const g3 = await snapshot("g3", [])
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current: g3, previous: g2 }))
  await env.R2.delete([snapshotKey("g2"), snapshotKey("g3")])
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(Date.now() + 60_001)
  await expect(getMetadata(env)).rejects.toHaveProperty("status", 503)
  await expect(getMetadata(env)).rejects.toHaveProperty("status", 503)
  vi.setSystemTime(Date.now() + 60_001)
  vi.spyOn(env.R2, "get").mockRejectedValue(new Error("pointer transport"))
  await expect(getMetadata(env)).rejects.toHaveProperty("status", 503)
})
it("allows a retained snapshot only when its generation and digest match an explicit reference", async () => {
  const g1 = await snapshot("g1")
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current: g1, previous: null }))
  await getMetadata(env)
  await env.R2.delete(snapshotKey("g1"))
  const missing = { generation: "missing", digest: "0".repeat(64) }
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current: missing, previous: g1 }))
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(Date.now() + 60_001)
  expect(await getMetadata(env)).toMatchObject({ generation: "g1", state: "previous" })
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current: missing, previous: { ...g1, digest: "1".repeat(64) } }))
  vi.setSystemTime(Date.now() + 60_001)
  await expect(getMetadata(env)).rejects.toHaveProperty("status", 503)
})

it.each([1, 16])("refreshes cached absence within the first %s request(s) after publication", async count => {
  vi.useFakeTimers({ toFake: ["Date"] })
  await env.R2.put(METADATA_R2_KEY, SEED_METADATA_JSON)
  expect((await getMetadata(env)).state).toBe("legacy")
  vi.setSystemTime(Date.now() + 1_000)
  const current = await snapshot("current", [])
  await env.R2.put(MIGRATED_KEY, MIGRATED_VALUE)
  await env.R2.put(CURRENT_KEY, JSON.stringify({ schemaVersion: 1, current, previous: null }))
  const get = vi.spyOn(env.R2, "get")
  const results = await Promise.all(Array.from({ length: count }, () => getMetadata(env)))
  for (const result of results) {
    expect(result).toMatchObject({ generation: "current", state: "current", works: [], validatedAt: new Date().toISOString() })
  }
  expect(get.mock.calls.filter(([key]) => key === CURRENT_KEY)).toHaveLength(1)
  expect(get.mock.calls.filter(([key]) => key === MIGRATED_KEY)).toHaveLength(1)
  expect(get.mock.calls.some(([key]) => key === METADATA_R2_KEY)).toBe(false)
  expect((await getMetadata(env)).state).toBe("current")
  expect(get.mock.calls.filter(([key]) => key === CURRENT_KEY)).toHaveLength(1)
})
it.each(["missing", "malformed", "transport"])("rejects a %s pointer after migration without reopening cached legacy", async failure => {
  await env.R2.put(METADATA_R2_KEY, SEED_METADATA_JSON)
  expect((await getMetadata(env)).state).toBe("legacy")
  await env.R2.put(MIGRATED_KEY, MIGRATED_VALUE)
  if (failure === "malformed") await env.R2.put(CURRENT_KEY, "invalid")
  const get = env.R2.get.bind(env.R2)
  const spy = vi.spyOn(env.R2, "get").mockImplementation((key, options) => {
    if (failure === "transport" && key === CURRENT_KEY) return Promise.reject(new Error("pointer unavailable"))
    return get(key, options)
  })
  const results = await Promise.allSettled(Array.from({ length: 16 }, () => getMetadata(env)))
  for (const result of results) expect(result).toMatchObject({ status: "rejected", reason: { status: 503 } })
  expect(spy.mock.calls.filter(([key]) => key === CURRENT_KEY)).toHaveLength(1)
  expect(spy.mock.calls.some(([key]) => key === METADATA_R2_KEY)).toBe(false)
})

it("retains metadata cleanup and fences a retired read from its replacement", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  const owner = { waitUntil: vi.fn() }
  let oldRelease!: (value: null) => void, nextRelease!: (value: null) => void
  let reads = 0
  const binding = { ...env, R2: { get: (key: string) => {
    if (key !== CURRENT_KEY) return Promise.resolve(null)
    reads++
    return new Promise<null>(resolve => { if (reads === 1) oldRelease = resolve; else nextRelease = resolve })
  } } as unknown as R2Bucket }
  const first = getMetadata(binding, owner).catch(error => error)
  await Promise.resolve(); await Promise.resolve()
  expect(owner.waitUntil).toHaveBeenCalledOnce()
  vi.setSystemTime(Date.now() + 20_001)
  const second = getMetadata(binding).catch(error => error)
  await Promise.resolve(); await Promise.resolve()
  await first
  oldRelease(null)
  await Promise.resolve(); await Promise.resolve()
  const joined = getMetadata(binding).catch(error => error)
  expect(reads).toBe(2)
  nextRelease(null)
  await Promise.all([second, joined])
})

it("retains and reclaims shared generation reads used by previous-work lookup", async () => {
  const reference = await snapshot("previous")
  vi.useFakeTimers({ toFake: ["Date"] })
  const owner = { waitUntil: vi.fn() }
  let oldRelease!: (value: null) => void, nextRelease!: (value: null) => void
  const read = vi.fn(() => new Promise<null>(resolve => {
    if (read.mock.calls.length === 1) oldRelease = resolve; else nextRelease = resolve
  }))
  const binding = { ...env, KV: { get: read } as unknown as KVNamespace }
  const metadata = { ...JSON.parse(SEED_METADATA_JSON), generation: "current", state: "current" as const, validatedAt: null, previous: reference }
  const first = getPreviousWork(binding, metadata, SEED_WORKS[0].id, owner)
  await Promise.resolve(); await Promise.resolve()
  expect(owner.waitUntil).toHaveBeenCalledOnce()
  vi.setSystemTime(Date.now() + 5001)
  const second = getPreviousWork(binding, metadata, SEED_WORKS[0].id)
  await Promise.resolve(); await Promise.resolve()
  expect(await first).toBeUndefined()
  oldRelease(null)
  const joined = getPreviousWork(binding, metadata, SEED_WORKS[0].id)
  expect(read).toHaveBeenCalledTimes(2)
  nextRelease(null)
  expect(await second).toEqual(SEED_WORKS[0])
  expect(await joined).toEqual(SEED_WORKS[0])
})
