import { describe, it, expect } from "vitest"
import { zipSync, strToU8 } from "fflate"
import { decompress } from "../src/decompress.js"

describe("decompress", () => {
  it("valid zip extraction — decompressed content matches the original", () => {
    const original = "こんにちは世界"
    const zip = zipSync({ "test.txt": strToU8(original) })

    const result = decompress(new Uint8Array(zip), ".txt")

    const decoded = new TextDecoder("utf-8").decode(result)
    expect(decoded).toBe(original)
  })

  it("corrupted zip data — throws an error", () => {
    const corrupted = new Uint8Array([0x00, 0x01, 0x02, 0x03])

    expect(() => decompress(corrupted, ".txt")).toThrow()
  })

  it("multi-file zip — returns only the .txt content", () => {
    const txtContent = "テキストファイルの内容"
    const zip = zipSync({
      "readme.md": strToU8("# README"),
      "data.csv": strToU8("a,b,c"),
      "story.txt": strToU8(txtContent),
      "image.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    })

    const result = decompress(new Uint8Array(zip), ".txt")

    const decoded = new TextDecoder("utf-8").decode(result)
    expect(decoded).toBe(txtContent)
  })

  it("multiple .txt files — returns the first one in sorted order", () => {
    const zip = zipSync({
      "b_story.txt": strToU8("second"),
      "a_story.txt": strToU8("first"),
    })

    const result = decompress(new Uint8Array(zip), ".txt")
    const decoded = new TextDecoder("utf-8").decode(result)
    expect(decoded).toBe("first")
  })

  it("empty zip (no .txt file) — throws an error", () => {
    const zip = zipSync({
      "readme.md": strToU8("# README"),
      "data.csv": strToU8("a,b,c"),
    })

    expect(() => decompress(new Uint8Array(zip), ".txt")).toThrow()
  })
})

describe("bounded decompression", () => {
  it("enforces actual total bytes at the boundary", () => {
    const zip = zipSync({ "a.txt": new Uint8Array(1000).fill(65), "b.txt": new Uint8Array(1000).fill(66) })
    expect(decompress(zip, ".txt", { maxOutputBytes: 2000 }).length).toBe(1000)
    expect(decompress(zip, ".txt", { maxOutputBytes: 2001 }).length).toBe(1000)
    expect(() => decompress(zip, ".txt", { maxOutputBytes: 1999 })).toThrow("limit")
  })
  it("rejects huge expansion and truncated ZIPs", () => {
    const zip = zipSync({ "a.txt": new Uint8Array(2_000_000) })
    expect(() => decompress(zip, ".txt", { maxOutputBytes: 1000 })).toThrow("limit")
    expect(() => decompress(zip.subarray(0, zip.length - 5), ".txt")).toThrow()
  })
  it("honors cancellation before decoding", () => {
    const controller = new AbortController()
    controller.abort()
    expect(() => decompress(zipSync({ "a.txt": new Uint8Array(10) }), ".txt", { signal: controller.signal })).toThrow()
  })
})

it("rejects content corruption even when the stream still inflates", () => {
  const zip = zipSync({ "a.txt": strToU8("content") }, { level: 0 })
  zip[35] ^= 1
  expect(() => decompress(zip, ".txt")).toThrow("checksum")
})
