import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { env } from "cloudflare:workers"
import { getContent } from "../../src/services/content"
import { resetContentControlForTesting, retryAfterMs, shareContent, SourceError } from "../../src/services/content-control"
import fixture from "../fixtures/047927.json"
const source = fixture.metadata.sourceUrls.text
const zip = () => Uint8Array.from(atob(fixture.zipBase64), c => c.charCodeAt(0))
beforeEach(async () => {
  resetContentControlForTesting()
  await env.KV.delete("content:047927")
  await env.R2.delete(new URL(source).pathname.slice(1))
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe("isolate fetch control", () => {
  it("shares a pending fetch and releases it after success", async () => {
    let release!: (r: Response) => void
    let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      started()
      return new Promise(resolve => { release = resolve })
    })
    const first = getContent("047927", source, env)
    await ready
    const second = getContent("047927", source, env)
    release(new Response(zip()))
    const results = await Promise.all([first, second])
    expect(results[0]).toEqual(results[1])
    expect(results[0].text).toBe(fixture.text)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect((await getContent("047927", source, env)).cacheHit).toBe(true)
  })
  it("waits after temporary failure, allows cache hits, and releases failed work", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "120" } }))
    await expect(getContent("047927", source, env)).rejects.toBeInstanceOf(SourceError)
    await expect(getContent("047927", source, env)).rejects.toBeInstanceOf(SourceError)
    expect(fetchMock).toHaveBeenCalledOnce()
    await env.KV.put("content:047927", fixture.text)
    expect((await getContent("047927", source, env)).cacheHit).toBe(true)
    await env.KV.delete("content:047927")
    vi.setSystemTime(Date.now() + 120_001)
    fetchMock.mockResolvedValueOnce(new Response(zip()))
    expect((await getContent("047927", source, env)).text).toBe(fixture.text)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it("bounds active work without evicting pending requests", async () => {
    const binding = { ...env, CONTENT_MAX_CONCURRENT: "1" }
    let release!: (r: { text: string; cacheHit: boolean }) => void
    const operation = vi.fn(() => new Promise<{ text: string; cacheHit: boolean }>(resolve => { release = resolve }))
    const first = shareContent(binding, "a", operation)
    await Promise.resolve()
    const joined = shareContent(binding, "a", operation)
    await expect(shareContent(binding, "b", operation)).rejects.toThrow("concurrency")
    release({ text: "a", cacheHit: false })
    await Promise.all([first, joined])
    expect(operation).toHaveBeenCalledOnce()
    expect(await shareContent(binding, "b", async () => ({ text: "b", cacheHit: false }))).toHaveProperty("text", "b")
  })
  it("keeps distinct environment and URL keys separate", async () => {
    const run = vi.fn(async () => ({ text: "x", cacheHit: false }))
    await Promise.all([shareContent(env, "id/url1", run), shareContent(env, "id/url2", run), shareContent({ ...env }, "id/url1", run)])
    expect(run).toHaveBeenCalledTimes(3)
  })
  it("parses Retry-After seconds and dates with a safe default", () => {
    const now = Date.parse("2026-09-06T00:00:00Z")
    expect(retryAfterMs("120", now)).toBe(120_000)
    expect(retryAfterMs("Sun, 06 Sep 2026 00:02:00 GMT", now)).toBe(120_000)
    for (const value of [null, "", "bad", "-1", "0", "Sat, 05 Sep 2026 00:00:00 GMT"]) expect(retryAfterMs(value, now)).toBe(60_000)
  })
})

it("retains shared completion including cleanup in the creator and joiner contexts", async () => {
  let release!: () => void
  const owner = { waitUntil: vi.fn() }, joiner = { waitUntil: vi.fn() }
  const first = shareContent(env, "retained", () => new Promise<void>(resolve => { release = resolve }), owner)
  const second = shareContent(env, "retained", async () => { throw new Error("must share") }, joiner)
  await Promise.resolve()
  expect(owner.waitUntil).toHaveBeenCalledOnce()
  expect(joiner.waitUntil).toHaveBeenCalledOnce()
  release()
  await Promise.all([first, second, owner.waitUntil.mock.calls[0][0]])
  expect(await shareContent(env, "retained", async () => "new task")).toBe("new task")
})

it("reclaims orphaned slots by wall time and fences late cleanup from their replacement", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }) // Do not fire the creator's timer: simulate its lost context.
  const binding = { ...env, CONTENT_MAX_CONCURRENT: "1", CONTENT_TIMEOUT_MS: "1000" }
  let oldRelease!: () => void, newRelease!: () => void
  const first = shareContent(binding, "a", () => new Promise<void>(resolve => { oldRelease = resolve })).catch(error => error)
  await Promise.resolve()
  vi.setSystemTime(Date.now() + 1001)
  const replacement = shareContent(binding, "a", () => new Promise<void>(resolve => { newRelease = resolve }))
  await Promise.resolve()
  expect(await first).toBeInstanceOf(SourceError)
  oldRelease()
  await Promise.resolve()
  await expect(shareContent(binding, "b", async () => "wrong")).rejects.toThrow("concurrency")
  newRelease()
  await replacement
  expect(await shareContent(binding, "b", async () => "recovered")).toBe("recovered")
})

it("returns a bounded failure and releases the slot even when the operation never settles", async () => {
  const owner = { waitUntil: vi.fn() }
  const binding = { ...env, CONTENT_MAX_CONCURRENT: "1", CONTENT_TIMEOUT_MS: "20" }
  await expect(shareContent(binding, "hung", () => new Promise(() => {}), owner)).rejects.toThrow("deadline")
  await owner.waitUntil.mock.calls[0][0]
  expect(await shareContent(binding, "next", async () => "ok")).toBe("ok")
})
