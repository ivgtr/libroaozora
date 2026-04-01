import { describe, it, expect, vi, beforeAll } from "vitest"
import { env, exports } from "cloudflare:workers"
import type { SearchResult, Work, WorkContent, ErrorResponse } from "@libroaozora/core"
import { seedKV } from "../fixtures/seed"

vi.mock("../../src/lib/csv-fetcher", () => ({
  fetchCSVZip: vi.fn(),
  parseCSVZip: vi.fn(),
}))

beforeAll(async () => {
  await seedKV(env.KV)
  await env.KV.put("content:001000", "テスト本文テキスト")
})

describe("GET /v1/works", () => {
  it("200 — SearchResult 形式で返す", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works")
    expect(res.status).toBe(200)
    const body = (await res.json()) as SearchResult<Work>
    expect(body).toHaveProperty("total")
    expect(body).toHaveProperty("page")
    expect(body).toHaveProperty("perPage")
    expect(body).toHaveProperty("items")
    expect(body.total).toBe(5)
  })

  it("title フィルタ — ?title=吾輩 で W1, W3 のみ返す", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works?title=吾輩")
    expect(res.status).toBe(200)
    const body = (await res.json()) as SearchResult<Work>
    expect(body.items).toHaveLength(2)
    const ids = body.items.map((w) => w.id)
    expect(ids).toContain("001000")
    expect(ids).toContain("003000")
  })

  it("ページネーション — ?per_page=1&page=2", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works?per_page=1&page=2")
    expect(res.status).toBe(200)
    const body = (await res.json()) as SearchResult<Work>
    expect(body.items).toHaveLength(1)
    expect(body.page).toBe(2)
  })

  it("ソート — ?sort=updated_at&order=asc で updatedAt 昇順", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works?sort=updated_at&order=asc")
    expect(res.status).toBe(200)
    const body = (await res.json()) as SearchResult<Work>
    const ids = body.items.map((w) => w.id)
    expect(ids).toEqual(["001000", "005000", "002000", "004000", "003000"])
  })

  it("全文検索未サポート — ?q=test → 501", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works?q=test")
    expect(res.status).toBe(501)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("NOT_SUPPORTED")
  })

  it("char_min 未サポート — ?char_min=100 → 400", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works?char_min=100")
    expect(res.status).toBe(400)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("BAD_REQUEST")
  })

  it("無効な sort — ?sort=access_count → 400", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works?sort=access_count")
    expect(res.status).toBe(400)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("BAD_REQUEST")
  })

  it("無効な order — ?order=invalid → 400", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works?order=invalid")
    expect(res.status).toBe(400)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("BAD_REQUEST")
  })

  it("per_page 上限超過 — ?per_page=200 → 400", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works?per_page=200")
    expect(res.status).toBe(400)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("BAD_REQUEST")
  })

  it("無効な page — ?page=abc → 400", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works?page=abc")
    expect(res.status).toBe(400)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("BAD_REQUEST")
  })

  it("無効な published_after — ?published_after=invalid → 400", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works?published_after=invalid")
    expect(res.status).toBe(400)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("BAD_REQUEST")
  })

  it("無効な copyright — ?copyright=TRUE → 400", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works?copyright=TRUE")
    expect(res.status).toBe(400)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("BAD_REQUEST")
  })
})

describe("GET /v1/works/:id", () => {
  it("200 — 存在する作品を返す", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works/001000")
    expect(res.status).toBe(200)
    const body = (await res.json()) as Work
    expect(body.id).toBe("001000")
  })

  it("404 — 存在しない作品", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works/999999")
    expect(res.status).toBe(404)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("NOT_FOUND")
  })
})

describe("GET /v1/works/:id/content", () => {
  it("200 — キャッシュ HIT でコンテンツを返す", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works/001000/content")
    expect(res.status).toBe(200)
    expect(res.headers.get("X-Cache-Status")).toBe("HIT")
    const body = (await res.json()) as WorkContent
    expect(body.workId).toBe("001000")
    expect(body).toHaveProperty("format")
    expect(body).toHaveProperty("content")
  })

  it("403 — 著作権存続作品", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works/004000/content")
    expect(res.status).toBe(403)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("FORBIDDEN")
  })

  it("501 — structured フォーマット未サポート", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works/001000/content?format=structured")
    expect(res.status).toBe(501)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("NOT_SUPPORTED")
  })

  it("404 — テキストソースなし", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works/005000/content")
    expect(res.status).toBe(404)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("NOT_FOUND")
  })
})
