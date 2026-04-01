import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { env } from "cloudflare:workers"

vi.mock("@libroaozora/core", () => ({
  decompress: vi.fn(() => new Uint8Array([1, 2, 3])),
  decode: vi.fn(() => "デコードされた本文"),
}))

import { decompress } from "@libroaozora/core"
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
  const R2_KEY = "cards/000001/files/001000_ruby.zip"
  const EXPECTED_FETCH_URL =
    "https://raw.githubusercontent.com/aozorabunko/aozorabunko/master/cards/000001/files/001000_ruby.zip"

  beforeEach(async () => {
    vi.clearAllMocks()
    await env.KV.delete("content:001000")
    await env.R2.delete(R2_KEY)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("KV にデータがある場合キャッシュから返す", async () => {
    await env.KV.put("content:001000", "テスト本文テキスト")

    const result = await getContent("001000", SOURCE_URL, env)

    expect(result).toEqual({ text: "テスト本文テキスト", cacheHit: true })
  })

  it("KV ミス + R2 ヒット → decode して KV にキャッシュ、cacheHit: true", async () => {
    await env.R2.put(R2_KEY, new Uint8Array([0x50, 0x4b, 0x03, 0x04]))

    const result = await getContent("001000", SOURCE_URL, env)

    expect(result).toEqual({ text: "デコードされた本文", cacheHit: true })

    const cached = await env.KV.get("content:001000")
    expect(cached).toBe("デコードされた本文")
  })

  it("KV + R2 ミス → GitHub fetch → R2 書き込み → KV キャッシュ、cacheHit: false", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(8)),
    )

    const result = await getContent("001000", SOURCE_URL, env)

    expect(result).toEqual({ text: "デコードされた本文", cacheHit: false })
    expect(fetchSpy).toHaveBeenCalledWith(
      EXPECTED_FETCH_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )

    const r2Object = await env.R2.get(R2_KEY)
    expect(r2Object).not.toBeNull()

    const cached = await env.KV.get("content:001000")
    expect(cached).toBe("デコードされた本文")
  })

  it("R2 データ破損 → R2 削除 → GitHub フォールバック", async () => {
    await env.R2.put(R2_KEY, new Uint8Array([0xff, 0xff]))

    vi.mocked(decompress).mockImplementationOnce(() => {
      throw new Error("corrupt zip")
    })

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(8)),
    )

    const result = await getContent("001000", SOURCE_URL, env)

    expect(result).toEqual({ text: "デコードされた本文", cacheHit: false })
    expect(fetchSpy).toHaveBeenCalledOnce()

    const cached = await env.KV.get("content:001000")
    expect(cached).toBe("デコードされた本文")
  })

  it("全ソース失敗 → エラーをスロー", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    )

    await expect(
      getContent("001000", SOURCE_URL, env),
    ).rejects.toThrow("Content fetch failed: 500")
  })
})
