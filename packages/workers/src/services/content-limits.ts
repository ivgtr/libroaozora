import type { Env } from "../env"
import { positiveLimit, SourceError } from "./content-control"

export function limits(env: Env) {
  return {
    zipBytes: positiveLimit(env.CONTENT_MAX_ZIP_BYTES, 8 * 1024 * 1024),
    outputBytes: positiveLimit(env.CONTENT_MAX_OUTPUT_BYTES, 16 * 1024 * 1024),
    totalMs: positiveLimit(env.CONTENT_TIMEOUT_MS, 20_000),
  }
}

/** Await every operation, but do not let an unavailable binding hold the response forever. */
export async function within<T>(operation: () => Promise<T> | T, milliseconds: number): Promise<T> {
  if (milliseconds <= 0) throw new SourceError("Content deadline exceeded", "temporary")
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SourceError("Content deadline exceeded", "temporary")), milliseconds)
      }),
    ])
  } finally { clearTimeout(timer) }
}

export async function readBounded(body: ReadableStream<Uint8Array> | null, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array> {
  if (!body) throw new SourceError("Empty source body", "invalid")
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  const abort = () => { void reader.cancel(signal?.reason).catch(() => {}) }
  signal?.addEventListener("abort", abort, { once: true })
  try {
    while (true) {
      signal?.throwIfAborted()
      const { value, done } = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      size += value.length
      if (size > maxBytes) throw new SourceError("ZIP input limit exceeded", "invalid")
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return bytes
  } catch (error) {
    await reader.cancel(error).catch(() => {})
    throw error
  } finally {
    signal?.removeEventListener("abort", abort)
    reader.releaseLock()
  }
}
