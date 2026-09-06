import { afterEach, expect, it, vi } from "vitest"
import { getContent } from "../../src/services/content"
import { resetContentControlForTesting } from "../../src/services/content-control"
import type { Env } from "../../src/env"
import fixture from "../fixtures/047927.json"

const delay = <T>(ms: number, value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms))
const stalled = () => new Promise<never>(() => {})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); resetContentControlForTesting() })

it.each(["r2", "kv", "both"])("returns validated text before the shared deadline with stalled %s saves", async stage => {
  vi.useFakeTimers()
  const zip = Uint8Array.from(atob(fixture.zipBase64), c => c.charCodeAt(0))
  const kvPut = vi.fn(stage === "r2" ? async () => {} : stalled)
  const r2Put = vi.fn(stage === "kv" ? async () => null : stalled)
  const env = {
    KV: { get: () => delay(2990, null), put: kvPut },
    R2: { get: () => delay(2990, null), put: r2Put },
    CONTENT_MAX_CONCURRENT: "1",
  } as unknown as Env
  vi.spyOn(globalThis, "fetch").mockImplementation(() => delay(9900, new Response(zip)))
  const retained: Promise<unknown>[] = []
  const lifetime = { waitUntil: (promise: Promise<unknown>) => { retained.push(promise) } }
  const result = getContent("047927", fixture.metadata.sourceUrls.text, env, lifetime)
  const outcome = result.then(value => ({ value }), error => ({ error }))
  await vi.advanceTimersByTimeAsync(20_000)
  expect(await outcome).toEqual({ value: { text: fixture.text, cacheHit: false } })
  await Promise.all(retained)
  expect(r2Put).toHaveBeenCalledOnce()
  expect(kvPut).toHaveBeenCalledOnce()
  // A completed task frees the sole concurrency slot for another work.
  env.KV.get = vi.fn().mockResolvedValue(fixture.text)
  await expect(getContent("other", fixture.metadata.sourceUrls.text, env)).resolves.toHaveProperty("text", fixture.text)
})

it("skips saves when valid text arrives after the storage cutoff", async () => {
  vi.useFakeTimers()
  const put = vi.fn(stalled)
  const env = { KV: { get: async () => null, put }, R2: { get: async () => null, put }, CONTENT_TIMEOUT_MS: "1000" } as unknown as Env
  const zip = Uint8Array.from(atob(fixture.zipBase64), c => c.charCodeAt(0))
  vi.spyOn(globalThis, "fetch").mockImplementation(() => delay(950, new Response(zip)))
  const outcome = getContent("047927", fixture.metadata.sourceUrls.text, env).then(value => ({ value }), error => ({ error }))
  await vi.advanceTimersByTimeAsync(1000)
  expect(await outcome).toEqual({ value: { text: fixture.text, cacheHit: false } })
  expect(put).not.toHaveBeenCalled()
})

it("still rejects at the hard deadline when no valid text is available", async () => {
  vi.useFakeTimers()
  const env = { KV: { get: async () => null }, R2: { get: async () => null }, CONTENT_TIMEOUT_MS: "1000" } as unknown as Env
  vi.spyOn(globalThis, "fetch").mockImplementation(stalled)
  const outcome = getContent("047927", fixture.metadata.sourceUrls.text, env).catch(error => error)
  await vi.advanceTimersByTimeAsync(1000)
  expect(await outcome).toHaveProperty("message", "Shared content deadline exceeded")
})
