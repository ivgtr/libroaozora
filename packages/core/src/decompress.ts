import { Unzip, UnzipInflate, strFromU8 } from "fflate"

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  return crc >>> 0
})

export interface DecompressOptions {
  /** Total actual output bytes across matching entries. */
  maxOutputBytes?: number
  signal?: AbortSignal
}

/** Extract matching files incrementally and return the first name in sorted order. */
export function decompress(data: Uint8Array, extension: string, options: DecompressOptions = {}): Uint8Array {
  const limit = options.maxOutputBytes ?? Infinity
  if (!(limit > 0)) throw new Error("Invalid ZIP output limit")
  // A streaming decoder alone can accept a truncated archive without its directory.
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let end = -1
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === data.length) { end = i; break }
  }
  if (end < 0 || view.getUint32(end + 16, true) + view.getUint32(end + 12, true) !== end) throw new Error("Invalid ZIP directory")
  const directory = new Map<string, { crc: number; size: number }>()
  let cursor = view.getUint32(end + 16, true)
  while (cursor < end) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Invalid ZIP directory entry")
    const nameLength = view.getUint16(cursor + 28, true)
    const next = cursor + 46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true)
    if (next > end) throw new Error("Invalid ZIP directory length")
    const name = strFromU8(data.subarray(cursor + 46, cursor + 46 + nameLength), !(view.getUint16(cursor + 8, true) & 2048))
    if (directory.has(name)) throw new Error("Duplicate ZIP entry")
    directory.set(name, { crc: view.getUint32(cursor + 16, true), size: view.getUint32(cursor + 24, true) })
    cursor = next
  }
  if (directory.size !== view.getUint16(end + 10, true)) throw new Error("Invalid ZIP entry count")
  let total = 0
  let selected: { name: string; chunks: Uint8Array[]; size: number; done: boolean } | undefined
  const entries: { done: boolean }[] = []
  const unzip = new Unzip(file => {
    if (!file.name.endsWith(extension)) return
    if (file.originalSize !== undefined && file.originalSize > limit) throw new Error("ZIP output limit exceeded")
    const expected = directory.get(file.name)
    if (!expected) throw new Error("ZIP entry missing from directory")
    let crc = 0xffffffff
    const entry = { name: file.name, chunks: [] as Uint8Array[], size: 0, done: false }
    entries.push(entry)
    if (!selected || file.name <= selected.name) {
      if (selected) selected.chunks = []
      selected = entry
    }
    file.ondata = (error, chunk, final) => {
      if (error) throw error
      options.signal?.throwIfAborted()
      total += chunk.length
      if (total > limit) { file.terminate(); throw new Error("ZIP output limit exceeded") }
      for (const byte of chunk) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]
      entry.size += chunk.length
      if (selected === entry) entry.chunks.push(chunk)
      if (final) {
        entry.done = true
        if (((crc ^ 0xffffffff) >>> 0) !== expected.crc || entry.size !== expected.size) throw new Error("Invalid ZIP checksum or size")
        if (file.originalSize !== undefined && file.originalSize !== entry.size) throw new Error("Invalid ZIP output size")
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  // Bound decoder output allocation per push even when declared sizes are false.
  for (let offset = 0; offset < data.length; offset += 1024) {
    options.signal?.throwIfAborted()
    unzip.push(data.subarray(offset, offset + 1024), offset + 1024 >= data.length)
  }
  if (!selected || entries.some(entry => !entry.done)) throw new Error(`No complete ${extension} file found in the zip archive`)
  const result = new Uint8Array(selected.size)
  let offset = 0
  for (const chunk of selected.chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}
