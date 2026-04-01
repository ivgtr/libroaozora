import { describe, it, expect, vi, beforeAll } from "vitest"
import { env, exports } from "cloudflare:workers"
import type { SearchResult, Work, Person, ErrorResponse } from "@libroaozora/core"
import { seedKV } from "../fixtures/seed"

vi.mock("../../src/lib/csv-fetcher", () => ({
  fetchCSVZip: vi.fn(),
  parseCSVZip: vi.fn(),
}))

beforeAll(async () => {
  await seedKV(env.KV)
})

describe("GET /v1/persons", () => {
  it("200 — SearchResult<Person> 形式で total=3 を返す", async () => {
    const res = await exports.default.fetch("http://localhost/v1/persons")
    expect(res.status).toBe(200)

    const body = (await res.json()) as SearchResult<Person>
    expect(body.total).toBe(3)
    expect(body.items).toHaveLength(3)
    expect(body.page).toBe(1)
    expect(body.perPage).toBe(20)
  })

  it("ページネーション — ?per_page=1 → items.length=1, total=3", async () => {
    const res = await exports.default.fetch("http://localhost/v1/persons?per_page=1")
    expect(res.status).toBe(200)

    const body = (await res.json()) as SearchResult<Person>
    expect(body.total).toBe(3)
    expect(body.items).toHaveLength(1)
    expect(body.page).toBe(1)
    expect(body.perPage).toBe(1)
  })

  it("per_page 上限超過 — ?per_page=200 → 400", async () => {
    const res = await exports.default.fetch("http://localhost/v1/persons?per_page=200")
    expect(res.status).toBe(400)

    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("BAD_REQUEST")
  })
})

describe("GET /v1/persons/:id", () => {
  it("200 — 存在する人物を返す", async () => {
    const res = await exports.default.fetch("http://localhost/v1/persons/000001")
    expect(res.status).toBe(200)

    const body = (await res.json()) as Person
    expect(body.id).toBe("000001")
    expect(body.lastName).toBe("夏目")
  })

  it("404 — 存在しない人物", async () => {
    const res = await exports.default.fetch("http://localhost/v1/persons/999999")
    expect(res.status).toBe(404)

    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("NOT_FOUND")
  })
})

describe("GET /v1/persons/:id/works", () => {
  it("200 — 指定人物の著作一覧を返す", async () => {
    const res = await exports.default.fetch("http://localhost/v1/persons/000001/works")
    expect(res.status).toBe(200)

    const body = (await res.json()) as SearchResult<Work>
    expect(body.total).toBe(3)
    expect(body.items).toHaveLength(3)
    expect(body.items.every((w) =>
      w.authors.some((a) => a.id === "000001"),
    )).toBe(true)
  })

  it("404 — 存在しない人物の著作", async () => {
    const res = await exports.default.fetch("http://localhost/v1/persons/999999/works")
    expect(res.status).toBe(404)

    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("NOT_FOUND")
  })
})
