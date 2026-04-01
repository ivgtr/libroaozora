import { decompress, decode } from "@libroaozora/core"

export async function getContent(
  workId: string,
  sourceUrl: string,
  kv: KVNamespace,
): Promise<{ text: string; cacheHit: boolean }> {
  const key = `content:${workId}`

  // Check KV cache
  const cached = await kv.get(key)
  if (cached !== null) {
    return { text: cached, cacheHit: true }
  }

  // Fetch and decompress
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`Content fetch failed: ${response.status}`)
  }

  const data = new Uint8Array(await response.arrayBuffer())
  const decompressed = decompress(data)
  const text = decode(decompressed) // Shift-JIS → UTF-8

  // Cache permanently (no TTL)
  await kv.put(key, text)

  return { text, cacheHit: false }
}
