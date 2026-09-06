import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { env } from "cloudflare:workers"
import { sha256 } from "@libroaozora/core"
import { getMetadata, getWorks, getPersons, resetMetadataForTesting } from "../../src/services/metadata"
import { CURRENT_KEY, snapshotKey, metadataKey } from "../../src/services/metadata-model"
import { METADATA_R2_KEY, META_WORKS_KEY } from "../../src/lib/constants"
import { SEED_WORKS, SEED_PERSONS, SEED_METADATA_JSON } from "../fixtures/seed"

beforeEach(async () => {
  resetMetadataForTesting()
  await env.R2.delete(CURRENT_KEY)
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
