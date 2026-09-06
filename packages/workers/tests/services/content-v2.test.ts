import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { env } from "cloudflare:workers"
import { sourceRevision, sha256 } from "@libroaozora/core"
import type { Work } from "@libroaozora/core"
import { getVersionedContent, contentKVKey, contentR2Key } from "../../src/services/content-v2"
import type { ContentEnvelope } from "../../src/services/content-v2"
import { resetContentControlForTesting } from "../../src/services/content-control"
import { resetMetadataForTesting } from "../../src/services/metadata"
import type { Metadata } from "../../src/services/metadata"
import fixture from "../fixtures/047927.json"
import control from "../fixtures/000789.json"
const work: Work = { ...fixture.metadata, textSource: { updatedAt: "2013-08-08", revisionCount: 0 } } as Work
const metadata: Metadata = { works: [work], persons: [], generation: "generation-1", syncedAt: "2026-09-06T00:00:00Z", state: "current", validatedAt: "2026-09-06T01:00:00Z", previous: null }
const zip = (base64 = fixture.zipBase64) => Uint8Array.from(atob(base64), c => c.charCodeAt(0))
beforeEach(async () => {
  resetContentControlForTesting(); resetMetadataForTesting()
  for (const w of [work, { ...work, textSource: { updatedAt: "2013-08-09", revisionCount: 1 } }]) {
    const revision = await sourceRevision(w)
    await env.KV.delete(contentKVKey(work.id, revision))
    await env.R2.delete(contentR2Key(work.id, revision))
  }
  await env.KV.delete(`content:${work.id}`)
  await env.R2.delete(new URL(work.sourceUrls.text!).pathname.slice(1))
})
afterEach(() => vi.restoreAllMocks())
it("does not promote legacy content; stores and restores the identified version", async () => {
  await env.KV.put(`content:${work.id}`, "legacy old content")
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(zip()))
  const first = await getVersionedContent(env, work, metadata)
  expect(first.text).toBe(fixture.text)
  expect(first.delivery).toMatchObject({ verification: "current", metadataGeneration: metadata.generation, validatedAt: metadata.validatedAt })
  const revision = await sourceRevision(work)
  const stored = await env.KV.get<ContentEnvelope>(contentKVKey(work.id, revision), "json")
  expect(stored?.textHash).toBe(await sha256(fixture.text))
  await env.KV.delete(contentKVKey(work.id, revision))
  expect((await getVersionedContent(env, work, metadata)).cacheHit).toBe(true)
  expect(fetchMock).toHaveBeenCalledOnce()
})
it.each(["kv", "r2", "both"])("keeps valid content on %s write failure", async store => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(zip()))
  if (store !== "r2") vi.spyOn(env.KV, "put").mockRejectedValue(new Error("KV down"))
  if (store !== "kv") vi.spyOn(env.R2, "put").mockRejectedValue(new Error("R2 down"))
  expect((await getVersionedContent(env, work, metadata)).text).toBe(fixture.text)
})
it.each([429, 500, 503])("returns a legacy candidate only on temporary status %s", async status => {
  await env.KV.put(`content:${work.id}`, fixture.text)
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }))
  const result = await getVersionedContent(env, work, metadata)
  expect(result.delivery).toMatchObject({ verification: "stale", sourceRevision: null, validatedAt: null })
  expect(await env.KV.get(contentKVKey(work.id, await sourceRevision(work)))).toBeNull()
})
it.each([403, 404, 410, 400])("never hides source withdrawal %s behind legacy content", async status => {
  await env.KV.put(`content:${work.id}`, fixture.text)
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }))
  await expect(getVersionedContent(env, work, metadata)).rejects.toHaveProperty("kind", "unavailable")
  expect(fetchMock).toHaveBeenCalledOnce()
})
it("does not fall back on a newly corrupt ZIP or mark legacy metadata current", async () => {
  await env.KV.put(`content:${work.id}`, fixture.text)
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("not a ZIP"))
  await expect(getVersionedContent(env, work, metadata)).rejects.toHaveProperty("kind", "invalid")
  fetchMock.mockResolvedValueOnce(new Response(zip()))
  expect((await getVersionedContent(env, work, { ...metadata, state: "legacy", validatedAt: null })).delivery.verification).toBe("unverified")
})
it("uses real conditional R2 puts to preserve the winner when isolates observe different contents", async () => {
  const releases: ((response: Response) => void)[] = []
  let ready!: () => void
  const started = new Promise<void>(resolve => { ready = resolve })
  vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => {
    releases.push(resolve)
    if (releases.length === 2) ready()
  }))
  const first = getVersionedContent({ ...env }, work, metadata)
  const second = getVersionedContent({ ...env }, work, metadata)
  await started
  releases[0](new Response(zip()))
  releases[1](new Response(zip(control.zipBase64)))
  const results = await Promise.all([first, second])
  expect(results[0].text).toBe(results[1].text)
  expect(results.some(result => result.delivery.verification === "unverified")).toBe(true)
  const saved = await env.KV.get<ContentEnvelope>(contentKVKey(work.id, await sourceRevision(work)), "json")
  expect(saved?.text).toBe(results[0].text)
})
it("an old acquisition finishing later cannot overwrite a new revision", async () => {
  let release!: (response: Response) => void
  let ready!: () => void
  const started = new Promise<void>(resolve => { ready = resolve })
  vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => new Promise(resolve => { release = resolve; ready() })).mockResolvedValueOnce(new Response(zip(control.zipBase64)))
  const old = getVersionedContent(env, work, metadata)
  await started
  const changed = { ...work, textSource: { updatedAt: "2013-08-09", revisionCount: 1 } }
  const newer = await getVersionedContent(env, changed, { ...metadata, works: [changed], generation: "generation-2" })
  release(new Response(zip()))
  const older = await old
  expect(newer.delivery.sourceRevision).not.toBe(older.delivery.sourceRevision)
  const saved = await env.KV.get<ContentEnvelope>(contentKVKey(work.id, await sourceRevision(changed)), "json")
  expect(saved?.text).toBe(newer.text)
})

it.each([false, true])("shares fallback work and caps distinct candidate sets (distinct=%s)", async distinct => {
  const scopedEnv = { ...env, CONTENT_MAX_CONCURRENT: "2" }
  const legacyKey = new URL(work.sourceUrls.text!).pathname.slice(1)
  await env.R2.put(legacyKey, zip())
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }))
  let release!: () => void, ready!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const started = new Promise<void>(resolve => { ready = resolve })
  let reads = 0, active = 0, peak = 0
  const get = env.R2.get.bind(env.R2)
  vi.spyOn(env.R2, "get").mockImplementation(async (key, options) => {
    if (key !== legacyKey) return get(key, options)
    reads++; active++; peak = Math.max(peak, active)
    if (reads === (distinct ? 2 : 1)) ready()
    try { await gate; return await get(key, options) } finally { active-- }
  })
  const tasks = Array.from({ length: 16 }, (_, index) => getVersionedContent(scopedEnv, work, {
    ...metadata, generation: `caller-${index}`,
    previous: distinct ? { generation: `candidate-${index}`, digest: "0".repeat(64) } : null,
  }))
  // Attach rejection handlers before releasing the storage barrier.
  const completed = Promise.allSettled(tasks)
  await started
  release()
  const results = await completed
  const success = results.filter(result => result.status === "fulfilled")
  expect(reads).toBe(distinct ? 2 : 1)
  expect(peak).toBe(distinct ? 2 : 1)
  expect(success).toHaveLength(distinct ? 2 : 16)
  for (let index = 0; index < results.length; index++) {
    const result = results[index]
    if (result.status === "fulfilled") {
      expect(result.value.text).toBe(fixture.text)
      expect(result.value.delivery).toMatchObject({ metadataGeneration: `caller-${index}`, verification: "stale" })
    }
  }
})
it("does not share previous-version contents across different metadata references", async () => {
  const { seedContent } = await import("../fixtures/seed")
  const { snapshotKey } = await import("../../src/services/metadata-model")
  const contexts: Metadata[] = []
  for (const count of [10, 11]) {
    const old = { ...work, textSource: { updatedAt: "2013-08-08", revisionCount: count } }
    await seedContent(env.KV, old, `old text ${count}`)
    const generation = `previous-${count}`
    const text = JSON.stringify({ schemaVersion: 1, generation, works: [old], persons: [], syncedAt: metadata.syncedAt })
    await env.R2.put(snapshotKey(generation), text)
    contexts.push({ ...metadata, generation: `caller-${count}`, previous: { generation, digest: await sha256(text) } })
  }
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }))
  const results = await Promise.all(contexts.map(context => getVersionedContent(env, work, context)))
  expect(results.map(result => result.text)).toEqual(["old text 10", "old text 11"])
  expect(results.map(result => result.delivery.metadataGeneration)).toEqual(["caller-10", "caller-11"])
})

it.each(["r2", "kv", "both", "winner-read"])("returns validated versioned content when %s outlasts the storage deadline", async stage => {
  const scopedEnv = { ...env, CONTENT_TIMEOUT_MS: "1000" }
  const stalled = () => new Promise<never>(() => {})
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 700))
    return new Response(zip())
  })
  if (stage !== "r2") vi.spyOn(env.KV, "put").mockImplementation(stalled)
  if (stage === "r2" || stage === "both") vi.spyOn(env.R2, "put").mockImplementation(stalled)
  if (stage === "winner-read") {
    // Vitest selects the unconditional overload; the production call uses onlyIf.
    vi.spyOn(env.R2, "put").mockImplementation((async () => null) as unknown as R2Bucket["put"])
    vi.spyOn(env.R2, "get").mockResolvedValueOnce(null).mockImplementation(stalled)
  }
  const result = await getVersionedContent(scopedEnv, work, metadata)
  expect(result.text).toBe(fixture.text)
  expect(result.delivery.verification).toBe(stage === "winner-read" ? "unverified" : "current")
  if (stage === "winner-read") expect(env.KV.put).not.toHaveBeenCalled()
})
