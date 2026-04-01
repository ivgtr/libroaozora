import { decompress, decode } from "@libroaozora/core"
import type { Env } from "../env"

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/aozorabunko/aozorabunko/master"

const KV_TTL = 2_592_000 // 30 days in seconds

export function resolveContentUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl)
  if (url.host === "www.aozora.gr.jp") {
    return `${GITHUB_RAW_BASE}${url.pathname}`
  }
  return sourceUrl
}

function toR2Key(sourceUrl: string): string {
  return new URL(sourceUrl).pathname.slice(1)
}

function decodeContentZip(data: Uint8Array): string {
  return decode(decompress(data, ".txt"))
}

export async function getContent(
  workId: string,
  sourceUrl: string,
  env: Env,
): Promise<{ text: string; cacheHit: boolean }> {
  const kvKey = `content:${workId}`

  // Layer 1: KV (hot cache)
  const cached = await env.KV.get(kvKey)
  if (cached !== null) {
    return { text: cached, cacheHit: true }
  }

  // Layer 2: R2 (origin store)
  const r2Key = toR2Key(sourceUrl)
  const r2Object = await env.R2.get(r2Key)
  if (r2Object !== null) {
    try {
      const data = new Uint8Array(await r2Object.arrayBuffer())
      const text = decodeContentZip(data)
      try { await env.KV.put(kvKey, text, { expirationTtl: KV_TTL }) } catch {}
      return { text, cacheHit: true }
    } catch {
      try { await env.R2.delete(r2Key) } catch {}
    }
  }

  // Layer 3: GitHub (origin fetch)
  const fetchUrl = resolveContentUrl(sourceUrl)
  const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    throw new Error(`Content fetch failed: ${response.status} ${fetchUrl}`)
  }

  const data = new Uint8Array(await response.arrayBuffer())
  const text = decodeContentZip(data)

  try {
    await env.R2.put(r2Key, data)
  } catch {
    // best-effort: R2 write failure does not block the response
  }

  await env.KV.put(kvKey, text, { expirationTtl: KV_TTL })

  return { text, cacheHit: false }
}
