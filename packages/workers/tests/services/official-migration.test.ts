import { createExecutionContext } from "cloudflare:test"
import { afterEach, expect, it, vi } from "vitest"
import { env } from "cloudflare:workers"
import type { Work, Delivery } from "@libroaozora/core"
import app from "../../src/index"
import { getMetadata, resetMetadataForTesting } from "../../src/services/metadata"
import { resetContentControlForTesting } from "../../src/services/content-control"
import { publishSnapshot } from "../../scripts/metadata-sync"
import { CURRENT_KEY } from "../../src/services/metadata-model"
import type { MetadataStore } from "../../scripts/metadata-sync"
import fixture from "../fixtures/047927.json"
import control from "../fixtures/000789.json"
const zip = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0))
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); resetMetadataForTesting(); resetContentControlForTesting() })
it("migrates legacy metadata, detects same-URL corrections, serves a known previous version and recovers without bulk downloads", async () => {
  resetMetadataForTesting(); resetContentControlForTesting()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(Date.parse("2026-09-06T00:00:00Z"))
  const work = fixture.metadata as Work
  await env.R2.delete(CURRENT_KEY)
  await env.R2.put("metadata/all.json", JSON.stringify({ works: [work], persons: [], syncedAt: "2026-09-05T00:00:00Z" }))
  expect((await getMetadata(env)).state).toBe("legacy")
  const store: MetadataStore = {
    readR2: async key => { const object = await env.R2.get(key); return object?.text() ?? null },
    writeR2: async (key, value) => { await env.R2.put(key, value) },
    writeKV: async (key, value, ttl) => { await env.KV.put(key, value, { expirationTtl: ttl }) },
  }
  const first = { ...work, textSource: { updatedAt: "2013-08-08", revisionCount: 0 } }
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(zip(fixture.zipBase64)))
  await publishSnapshot(store, { schemaVersion: 1, generation: "migration-first", works: [first], persons: [], syncedAt: "2026-09-06T00:00:00Z" })
  expect(fetchMock).not.toHaveBeenCalled()
  // The first request after publication must succeed even with a cached absence.
  vi.setSystemTime(Date.now() + 1_000)
  const request = () => app.fetch(new Request("http://local/v1/works/047927/content?format=raw"), env, createExecutionContext())
  const initial = await (await request()).json() as { content: string; delivery: Delivery; work: Work }
  expect(initial.delivery.verification).toBe("current")
  expect(initial.content).toBe(fixture.text)
  const changed = { ...first, title: "訂正後タイトル", textSource: { updatedAt: "2013-08-09", revisionCount: 1 } }
  await publishSnapshot(store, { schemaVersion: 1, generation: "migration-second", works: [changed], persons: [], syncedAt: "2026-09-06T00:01:00Z" })
  vi.setSystemTime(Date.now() + 60_001)
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
  const oldResponse = await request()
  const stale = await oldResponse.json() as typeof initial
  expect(oldResponse.headers.get("Cache-Control")).toBe("no-store")
  expect(stale.delivery).toMatchObject({ metadataGeneration: "migration-second", verification: "stale", contentId: initial.delivery.contentId, sourceRevision: initial.delivery.sourceRevision })
  expect(stale.work.title).toBe(changed.title)
  vi.setSystemTime(Date.now() + 60_001)
  fetchMock.mockResolvedValueOnce(new Response(zip(control.zipBase64)))
  const recovered = await (await request()).json() as typeof initial
  expect(recovered.delivery.verification).toBe("current")
  expect(recovered.delivery.contentId).not.toBe(initial.delivery.contentId)
  expect(recovered.delivery.sourceRevision).not.toBe(initial.delivery.sourceRevision)
  expect(fetchMock).toHaveBeenCalledTimes(3)
  await publishSnapshot(store, { schemaVersion: 1, generation: "migration-withdrawn", works: [{ ...changed, copyrightFlag: true }], persons: [], syncedAt: "2026-09-06T00:04:00Z" })
  vi.setSystemTime(Date.now() + 60_001)
  expect((await request()).status).toBe(403)
  expect(fetchMock).toHaveBeenCalledTimes(3)
  await env.R2.delete(CURRENT_KEY)
  vi.setSystemTime(Date.now() + 60_001)
  expect((await request()).status).toBe(403)
  resetMetadataForTesting()
  expect((await request()).status).toBe(503)
  expect(fetchMock).toHaveBeenCalledTimes(3)
})
