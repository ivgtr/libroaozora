import { decompress, parseCSV } from "@libroaozora/core"
import type { ParseResult } from "@libroaozora/core"

const CSV_URL =
  "https://raw.githubusercontent.com/aozorabunko/aozorabunko/master/index_pages/list_person_all_extended_utf8.zip"

export async function fetchAndParseCSV(): Promise<ParseResult> {
  const response = await fetch(CSV_URL)
  if (!response.ok) {
    throw new Error(`CSV fetch failed: ${response.status}`)
  }

  const data = new Uint8Array(await response.arrayBuffer())
  const decompressed = decompress(data, ".csv")
  const csvText = new TextDecoder().decode(decompressed)

  return parseCSV(csvText)
}
