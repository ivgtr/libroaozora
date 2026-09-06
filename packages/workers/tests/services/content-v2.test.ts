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
