export const CSV_URL = "https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip"

// No storage writes: safe to import in tests and measurement tools.
export async function downloadMetadata(): Promise<Uint8Array> {
  const response = await fetch(CSV_URL, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`CSV fetch failed: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}
