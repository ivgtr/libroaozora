import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { env } from "cloudflare:workers"

vi.mock("@libroaozora/core", () => ({
  decompress: vi.fn(() => new Uint8Array([1, 2, 3])),
  decode: vi.fn(() => "デコードされた本文"),
}))

import { getContent } from "../../src/services/content"

describe("getContent", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await env.KV.delete("content:001000")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("KV にデータがある場合キャッシュから返す", async () => {
    await env.KV.put("content:001000", "テスト本文テキスト")

    const result = await getContent("001000", "https://example.com/file.zip", env.KV)

    expect(result).toEqual({ text: "テスト本文テキスト", cacheHit: true })
  })

  it("KV が空の場合 fetch → decompress → decode して KV にキャッシュする", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ArrayBuffer(8)),
    )

    const result = await getContent("001000", "https://example.com/file.zip", env.KV)

    expect(result).toEqual({ text: "デコードされた本文", cacheHit: false })
    expect(fetchSpy).toHaveBeenCalledWith("https://example.com/file.zip")

    const cached = await env.KV.get("content:001000")
    expect(cached).toBe("デコードされた本文")
  })
})
