import type { TaskLifetime } from "./shared-task"
import { decompress, decode } from "@libroaozora/core"
import { limits, readBounded, within } from "./content-limits"
import type { Env } from "../env"
import { SourceError, shareContent, checkCooldown, recordFailure, retryAfterMs } from "./content-control"

const KV_TTL = 2_592_000 // 30 days in seconds

function toR2Key(sourceUrl: string): string {
  return new URL(sourceUrl).pathname.slice(1)
}

export function decodeContentZip(data: Uint8Array, maxOutputBytes: number): string {
  return validateText(decode(decompress(data, ".txt", { maxOutputBytes })))
}

export function validateText(text: string): string {
  if (!text.trim() || /^\s*(?:<!doctype html|<html[\s>])/i.test(text)) {
    throw new Error("Invalid content text")
  }
  return text
}

async function contentStage<T>(
  workId: string,
  stage: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  try {
    const result = await operation()
    if (stage.endsWith("write")) console.info("Content storage saved", { workId, stage })
    return result
  } catch (error) {
    console.error("Content operation failed", { workId, stage, error })
    throw error
  }
}

export async function getContent(
  workId: string,
  sourceUrl: string,
  env: Env,
  lifetime?: TaskLifetime,
): Promise<{ text: string; cacheHit: boolean }> {
  const key = JSON.stringify([workId, sourceUrl])
  return shareContent(env, key, () => loadContent(workId, sourceUrl, env, key), lifetime)
}

async function loadContent(workId: string, sourceUrl: string, env: Env, key: string): Promise<{ text: string; cacheHit: boolean }> {
  const bounds = limits(env)
  const deadline = Date.now() + bounds.totalMs
  const kvKey = `content:${workId}`
  const run = <T>(stage: string, operation: () => T | Promise<T>) =>
    contentStage(workId, stage, () => within(operation, Math.min(3000, deadline - Date.now())))

  // Layer 1: KV (hot cache)
  try {
    const cached = await run("kv-read", () => env.KV.get(kvKey))
    if (cached !== null) {
      await run("kv-validate", () => validateText(cached))
      console.info("Content served", { workId, source: "kv" })
      return { text: cached, cacheHit: true }
    }
  } catch { /* Continue to the durable cache. */ }

  // Layer 2: never delete on a read or decode failure. A normal fetch repairs it.
  const r2Key = toR2Key(sourceUrl)
  try {
    const r2Object = await run("r2-read", () => env.R2.get(r2Key))
    if (r2Object !== null) {
      const data = await run("r2-body", () => readBounded(r2Object.body, bounds.zipBytes, AbortSignal.timeout(Math.max(1, Math.min(3000, deadline - Date.now())))))
      const text = await run("zip-decode", () => decodeContentZip(data, bounds.outputBytes))
      try { await run("kv-write", () => env.KV.put(kvKey, text, { expirationTtl: KV_TTL })) } catch {}
      console.info("Content served", { workId, source: "r2" })
      return { text, cacheHit: true }
    }
  } catch { /* Continue to the official source. */ }

  // Layer 3: the complete distribution URL from metadata
  const { data, text } = await fetchSource(workId, sourceUrl, env, key, deadline)

  try {
    await run("r2-write", () => env.R2.put(r2Key, data))
  } catch {
    // best-effort: R2 write failure does not block the response
  }

  try { await run("kv-write", () => env.KV.put(kvKey, text, { expirationTtl: KV_TTL })) } catch {}

  console.info("Content served", { workId, source: "origin", url: sourceUrl })
  return { text, cacheHit: false }
}

export async function fetchSource(workId: string, sourceUrl: string, env: Env, key: string, deadline: number) {
  const bounds = limits(env)
  const run = <T>(stage: string, operation: () => T | Promise<T>) => contentStage(workId, stage, operation)
  checkCooldown(env, key)
  const data = await contentStage(workId, "origin-fetch", async () => {
    try {
    const url = sourceUrl
    const signal = AbortSignal.timeout(Math.max(1, Math.min(10_000, deadline - Date.now())))
    const response = await fetch(url, { signal })
    console.info("Content origin response", { workId, url, status: response.status })
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new SourceError(`Content fetch failed: ${response.status} ${url}`,
        response.status === 429 || response.status >= 500 ? "temporary" : "unavailable",
        response.status, response.status === 429 ? retryAfterMs(response.headers.get("Retry-After")) : 60_000)

    }
    return await readBounded(response.body, bounds.zipBytes, signal)
    } catch (cause) {
      const error = cause instanceof SourceError ? cause : new SourceError("Content network or timeout failure", "temporary", undefined, 60_000, { cause })
      recordFailure(env, key, error)
      throw error
    }
  })
  const text = await run("zip-decode", () => {
    try { return decodeContentZip(data, bounds.outputBytes) } catch (cause) {
      throw new SourceError("Invalid source ZIP", "invalid", undefined, 60_000, { cause })
    }
  })

  return { data, text }
}
