import { createExecutionContext } from "cloudflare:test"
import { sourceRevision } from "@libroaozora/core"
import type { Work } from "@libroaozora/core"
import { contentKVKey, contentR2Key } from "../../src/services/content-v2"
import { resetMetadataForTesting } from "../../src/services/metadata"
import { METADATA_R2_KEY } from "../../src/lib/constants"
import { resetContentControlForTesting } from "../../src/services/content-control"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { env } from "cloudflare:workers"
import { getContent } from "../../src/services/content"
import app from "../../src/index"
import { META_WORKS_KEY, META_PERSONS_KEY } from "../../src/lib/constants"
import fixture from "../fixtures/047927.json"

const source = fixture.metadata.sourceUrls.text
const r2Key = new URL(source).pathname.slice(1)
const zip = () => Uint8Array.from(atob(fixture.zipBase64), (c) => c.charCodeAt(0))

beforeEach(async () => {
  resetContentControlForTesting()
  resetMetadataForTesting()
  const revision = await sourceRevision(fixture.metadata as Work)
  await env.KV.delete(contentKVKey("047927", revision))
  await env.R2.delete(contentR2Key("047927", revision))
  await env.KV.delete("content:047927")
  await env.R2.delete(r2Key)
})

afterEach(() => vi.restoreAllMocks())

describe("047927 official origin with real ZIP decoding", () => {
  it("fetches the official source once and caches correct text", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(zip()))
    await env.KV.put(META_WORKS_KEY, JSON.stringify([fixture.metadata]))
    await env.KV.put(META_PERSONS_KEY, "[]")
    await env.R2.put(METADATA_R2_KEY, JSON.stringify({ works: [fixture.metadata], persons: [], syncedAt: "2026-09-06T00:00:00Z" }))

    const res = await app.fetch(new Request("https://test/v1/works/047927/content?format=raw"), env, createExecutionContext())
    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache-Status")).toBe("MISS")
    expect(await res.json()).toMatchObject({ workId: "047927", format: "raw", content: fixture.text })
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([source])
    const revision = await sourceRevision(fixture.metadata as Work)
    expect(await env.KV.get(contentKVKey("047927", revision), "json")).toHaveProperty("text", fixture.text)
    expect(new Uint8Array(await (await env.R2.get(contentR2Key("047927", revision)))!.arrayBuffer())).toEqual(zip())
    const request = () => app.fetch(new Request("https://test/v1/works/047927/content?format=raw"), env, createExecutionContext())
    expect((await request()).headers.get("X-Cache-Status")).toBe("HIT")
    await env.KV.delete(contentKVKey("047927", revision))
    expect((await request()).headers.get("X-Cache-Status")).toBe("HIT")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("a successful official fetch needs no retry", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(zip()))
    expect(await getContent("047927", source, env)).toEqual({ text: fixture.text, cacheHit: false })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("records the final origin failure without disclosing it in the API body", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
    await env.KV.put(META_WORKS_KEY, JSON.stringify([fixture.metadata]))
    await env.KV.put(META_PERSONS_KEY, "[]")
    await env.R2.put(METADATA_R2_KEY, JSON.stringify({ works: [fixture.metadata], persons: [], syncedAt: "2026-09-06T00:00:00Z" }))
    const res = await app.fetch(new Request("https://test/v1/works/047927/content?format=raw"), env, createExecutionContext())
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: { code: "SOURCE_TEMPORARY_ERROR", message: "Content source unavailable" } })
    expect(error).toHaveBeenCalledWith("Content operation failed", {
      workId: "047927", stage: "origin-fetch", error: expect.objectContaining({ message: `Content fetch failed: 503 ${source}` }),
    })
    expect(await env.KV.get("content:047927")).toBeNull()
    expect(await env.R2.get(r2Key)).toBeNull()
  })

  it("logs a sanitized header-stage network failure", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new TypeError("Network connection lost: https://www.aozora.gr.jp/private?token=secret"),
    )

    await expect(getContent("047927", source, env)).rejects.toHaveProperty("kind", "temporary")

    expect(log).toHaveBeenCalledWith("Official origin fetch failed", expect.objectContaining({
      workId: "047927",
      originHost: "www.aozora.gr.jp",
      phase: "headers",
      signalAborted: false,
      error: {
        name: "TypeError",
        message: "Network connection lost: [url]",
      },
    }))
  })

  it("logs a body-stage failure after receiving official response headers", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new ReadableStream({
      start(controller) { controller.error(new Error("origin body interrupted")) },
    })))

    await expect(getContent("047927", source, env)).rejects.toHaveProperty("kind", "temporary")

    expect(log).toHaveBeenCalledWith("Official origin fetch failed", expect.objectContaining({
      workId: "047927",
      originHost: "www.aozora.gr.jp",
      phase: "body",
      error: { name: "Error", message: "origin body interrupted" },
    }))
  })

  it.each([403, 404, 410, 500])("does not retry official %s", async (status) => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status }))
    await expect(getContent("047927", source, env)).rejects.toThrow(`Content fetch failed: ${status}`)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("does not retry arbitrary non-mirror URLs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 404 }))
    await expect(getContent("047927", "https://example.com/file.zip", env)).rejects.toThrow("Content fetch failed: 404")
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("distinguishes a KV read failure from an origin failure", async () => {
    const failure = new Error("KV read unavailable")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(env.KV, "get").mockRejectedValueOnce(failure)
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(zip()))
    expect(await getContent("047927", source, env)).toEqual({ text: fixture.text, cacheHit: false })
    expect(log).toHaveBeenCalledWith("Content operation failed", {
      workId: "047927", stage: "kv-read", error: failure,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("returns normal content even when KV write fails", async () => {
    const failure = new Error("KV write unavailable")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(zip()))
    vi.spyOn(env.KV, "put").mockRejectedValueOnce(failure)
    expect(await getContent("047927", source, env)).toEqual({ text: fixture.text, cacheHit: false })
    expect(log).toHaveBeenCalledWith("Content operation failed", {
      workId: "047927", stage: "kv-write", error: failure,
    })
  })
})

it("decodes the real 789 official ZIP through raw/plain routes", async () => {
  const control = (await import("../fixtures/000789.json")).default
  await env.KV.delete("content:000789")
  await env.R2.delete(new URL(control.metadata.sourceUrls.text).pathname.slice(1))
  await env.KV.put(META_WORKS_KEY, JSON.stringify([control.metadata]))
  await env.KV.put(META_PERSONS_KEY, "[]")
    await env.R2.put(METADATA_R2_KEY, JSON.stringify({ works: [control.metadata], persons: [], syncedAt: "2026-09-06T00:00:00Z" }))
  const bytes = Uint8Array.from(atob(control.zipBase64), c => c.charCodeAt(0))
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(bytes))
  const raw = await app.fetch(new Request("https://test/v1/works/000789/content?format=raw"), env, createExecutionContext())
  expect(raw.status).toBe(200)
  const body = await raw.json() as { content: string }
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.content))
  expect(Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("")).toBe(control.textSha256)
  const plain = await app.fetch(new Request("https://test/v1/works/000789/content?format=plain"), env, createExecutionContext())
  expect(plain.status).toBe(200)
  expect(plain.headers.get("X-Cache-Status")).toBe("HIT")
  expect(fetchMock).toHaveBeenCalledOnce()
})
