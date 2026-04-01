import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { env } from "cloudflare:workers"

vi.mock("@libroaozora/core", () => ({
  decompress: vi.fn(() => new Uint8Array([1, 2, 3])),
  decode: vi.fn(() => "デコードされた本文"),
}))

import { getContent, resolveContentUrl } from "../../src/services/content"

describe("resolveContentUrl", () => {
  it("aozora.gr.jp URL を GitHub raw URL に変換する", () => {
    const result = resolveContentUrl(
      "https://www.aozora.gr.jp/cards/000148/files/789_ruby_5639.zip",
    )
    expect(result).toBe(
      "https://raw.githubusercontent.com/aozorabunko/aozorabunko/master/cards/000148/files/789_ruby_5639.zip",
    )
  })

  it("aozora.gr.jp 以外の URL はそのまま返す", () => {
    const url = "https://example.com/file.zip"
    expect(resolveContentUrl(url)).toBe(url)
  })
})

describe("getContent", () => {
  const SOURCE_URL = "https://www.aozora.gr.jp/cards/000001/files/001000_ruby.zip"
  const EXPECTED_FETCH_URL =
    "https://raw.githubusercontent.com/aozorabunko/aozorabunko/master/cards/000001/files/001000_ruby.zip"

  beforeEach(async () => {
    vi.clearAllMocks()
    await env.KV.delete("content:001000")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("KV にデータがある場合キャッシュから返す", async () => {
    await env.KV.put("content:001000", "テスト本文テキスト")

    const result = await getContent("001000", SOURCE_URL, env.KV)

    expect(result).toEqual({ text: "テスト本文テキスト", cacheHit: true })
  })

  it("KV が空の場合 fetch → decompress → decode して KV にキャッシュする", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(8)),
    )

    const result = await getContent("001000", SOURCE_URL, env.KV)

    expect(result).toEqual({ text: "デコードされた本文", cacheHit: false })
    expect(fetchSpy).toHaveBeenCalledWith(
      EXPECTED_FETCH_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )

    const cached = await env.KV.get("content:001000")
    expect(cached).toBe("デコードされた本文")
  })
})
