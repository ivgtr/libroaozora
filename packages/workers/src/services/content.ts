import { decompress, decode } from "@libroaozora/core"

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/aozorabunko/aozorabunko/master"

export function resolveContentUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl)
  if (url.host === "www.aozora.gr.jp") {
    return `${GITHUB_RAW_BASE}${url.pathname}`
  }
  return sourceUrl
}

export async function getContent(
  workId: string,
  sourceUrl: string,
  kv: KVNamespace,
): Promise<{ text: string; cacheHit: boolean }> {
  const key = `content:${workId}`

  const cached = await kv.get(key)
  if (cached !== null) {
    return { text: cached, cacheHit: true }
  }

  const fetchUrl = resolveContentUrl(sourceUrl)
  const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    throw new Error(`Content fetch failed: ${response.status} ${fetchUrl}`)
  }

  const data = new Uint8Array(await response.arrayBuffer())
  const decompressed = decompress(data, ".txt")
  const text = decode(decompressed)

  await kv.put(key, text)

  return { text, cacheHit: false }
}
