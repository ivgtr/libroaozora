export const CSV_URL = "https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip"

// No storage writes: safe to import in tests and measurement tools.
export async function downloadMetadata(): Promise<Uint8Array> {
  const response = await fetch(CSV_URL, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) { await response.body?.cancel(); throw new Error(`CSV fetch failed: ${response.status}`) }
  if (!response.body) throw new Error("Empty CSV ZIP")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 8 * 1024 * 1024) throw new Error("CSV ZIP size limit exceeded")
      chunks.push(value)
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}
