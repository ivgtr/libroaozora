import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { env } from "cloudflare:workers"
import app from "../../src/index"
import { getContent } from "../../src/services/content"
import { resetContentControlForTesting } from "../../src/services/content-control"
import { getMetadata, resetMetadataForTesting } from "../../src/services/metadata"
import { METADATA_R2_KEY, META_WORKS_KEY, META_PERSONS_KEY, META_SYNCED_AT_KEY } from "../../src/lib/constants"
import fixture from "../fixtures/047927.json"
const source = fixture.metadata.sourceUrls.text
const key = new URL(source).pathname.slice(1)
const zip = () => Uint8Array.from(atob(fixture.zipBase64), c => c.charCodeAt(0))
const snapshot = () => JSON.stringify({ works: [fixture.metadata], persons: [], syncedAt: "2026-09-06T00:00:00Z" })
beforeEach(async () => {
  resetContentControlForTesting()
  resetMetadataForTesting()
  for (const key of ["content:047927", META_WORKS_KEY, META_PERSONS_KEY, META_SYNCED_AT_KEY]) await env.KV.delete(key)
  await env.R2.delete(key)
  await env.R2.delete(METADATA_R2_KEY)
})
afterEach(() => vi.restoreAllMocks())

it.each(["kv-read", "r2-read", "r2-body", "kv-write", "r2-write", "both-write"])("returns valid text through %s failure", async stage => {
  const failure = new Error(stage)
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(zip()))
  const del = vi.spyOn(env.R2, "delete")
  if (stage === "kv-read") vi.spyOn(env.KV, "get").mockRejectedValueOnce(failure)
  if (stage === "r2-read") vi.spyOn(env.R2, "get").mockRejectedValueOnce(failure)
  if (stage === "r2-body") {
    await env.R2.put(key, zip())
    const object = (await env.R2.get(key))!
    Object.defineProperty(object, "body", { value: new ReadableStream({ start(controller) { controller.error(failure) } }) })
    vi.spyOn(env.R2, "get").mockResolvedValueOnce(object)
  }
  if (["kv-write", "both-write"].includes(stage)) vi.spyOn(env.KV, "put").mockRejectedValueOnce(failure)
  if (["r2-write", "both-write"].includes(stage)) vi.spyOn(env.R2, "put").mockRejectedValueOnce(failure)
  expect(await getContent("047927", source, env)).toEqual({ text: fixture.text, cacheHit: false })
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(del).not.toHaveBeenCalled()
})
it("metadata KV failure still reaches the real content route through R2", async () => {
  await env.R2.put(METADATA_R2_KEY, snapshot())
  await env.R2.put(key, zip())
  vi.spyOn(env.KV, "get").mockRejectedValue(new Error("KV down"))
  vi.spyOn(env.KV, "put").mockRejectedValue(new Error("KV down"))
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(zip()))
  const response = await app.fetch(new Request("https://test/v1/works/047927/content?format=raw"), env)
  expect(response.status).toBe(200)
  expect(await response.json()).toHaveProperty("content", fixture.text)
  expect(fetchMock).toHaveBeenCalledOnce()
})
it("restored metadata still denies copyrighted content", async () => {
  const data = JSON.parse(snapshot())
  data.works[0].copyrightFlag = true
  await env.R2.put(METADATA_R2_KEY, JSON.stringify(data))
  vi.spyOn(env.KV, "get").mockRejectedValue(new Error("KV down"))
  const fetchMock = vi.spyOn(globalThis, "fetch")
  const response = await app.fetch(new Request("https://test/v1/works/047927/content"), env)
  expect(response.status).toBe(403)
  expect(fetchMock).not.toHaveBeenCalled()
})
it("metadata R2 body failure does not delete data and returns 503", async () => {
  await env.R2.put(METADATA_R2_KEY, snapshot())
  const object = (await env.R2.get(METADATA_R2_KEY))!
  vi.spyOn(object, "text").mockRejectedValue(new Error("body interrupted"))
  vi.spyOn(env.R2, "get").mockResolvedValueOnce(object)
  const del = vi.spyOn(env.R2, "delete")
  await expect(getMetadata(env)).rejects.toHaveProperty("status", 503)
  expect(del).not.toHaveBeenCalled()
})
it("all metadata stores failing produces 503", async () => {
  vi.spyOn(env.KV, "get").mockRejectedValue(new Error("KV down"))
  vi.spyOn(env.R2, "get").mockRejectedValue(new Error("R2 down"))
  const response = await app.fetch(new Request("https://test/v1/works/047927/content"), env)
  expect(response.status).toBe(503)
})
it.each(["corrupt", "timeout"])("does not save %s origin responses", async kind => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
  if (kind === "corrupt") fetchMock.mockResolvedValue(new Response("bad zip"))
  else fetchMock.mockRejectedValue(new DOMException("Timed out", "TimeoutError"))
  const kv = vi.spyOn(env.KV, "put")
  const r2 = vi.spyOn(env.R2, "put")
  await expect(getContent("047927", source, env)).rejects.toThrow()
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(kv).not.toHaveBeenCalled()
  expect(r2).not.toHaveBeenCalled()
})
