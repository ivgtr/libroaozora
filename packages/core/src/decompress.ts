import { unzipSync } from "fflate"

/**
 * zip アーカイブから最初の .txt ファイルを抽出して返す。
 * .txt ファイルが見つからない場合やデータが不正な場合はエラーをスローする。
 */
export function decompress(data: Uint8Array): Uint8Array {
  const files = unzipSync(data, {
    filter: (file) => file.name.endsWith(".txt"),
  })

  const entries = Object.keys(files).sort()
  if (entries.length === 0) {
    throw new Error("No .txt file found in the zip archive")
  }

  return files[entries[0]]
}
