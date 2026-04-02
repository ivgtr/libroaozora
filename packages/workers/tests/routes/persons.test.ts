import { describe, it, expect, beforeAll } from "vitest"
import { env, exports } from "cloudflare:workers"
import type { SearchResult, Work, Person, ErrorResponse } from "@libroaozora/core"
import { seedKV } from "../fixtures/seed"

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

  describe("名前フィルタ", () => {
    it("姓の部分一致 — ?name=夏目 → 夏目漱石のみ", async () => {
      const res = await exports.default.fetch("http://localhost/v1/persons?name=夏目")
      expect(res.status).toBe(200)

      const body = (await res.json()) as SearchResult<Person>
      expect(body.total).toBe(1)
      expect(body.items[0].lastName).toBe("夏目")
    })

    it("名の部分一致 — ?name=龍之介 → 芥川龍之介のみ", async () => {
      const res = await exports.default.fetch("http://localhost/v1/persons?name=龍之介")
      expect(res.status).toBe(200)

      const body = (await res.json()) as SearchResult<Person>
      expect(body.total).toBe(1)
      expect(body.items[0].firstName).toBe("龍之介")
    })

    it("読みの部分一致 — ?name=だざい → 太宰治のみ", async () => {
      const res = await exports.default.fetch("http://localhost/v1/persons?name=だざい")
      expect(res.status).toBe(200)

      const body = (await res.json()) as SearchResult<Person>
      expect(body.total).toBe(1)
      expect(body.items[0].lastName).toBe("太宰")
    })

    it("該当なし — ?name=存在しない → 0 件", async () => {
      const res = await exports.default.fetch("http://localhost/v1/persons?name=存在しない")
      expect(res.status).toBe(200)

      const body = (await res.json()) as SearchResult<Person>
      expect(body.total).toBe(0)
      expect(body.items).toHaveLength(0)
    })
  })

  describe("ソート", () => {
    it("名前昇順 — ?sort=name&order=asc → 読み順", async () => {
      const res = await exports.default.fetch("http://localhost/v1/persons?sort=name&order=asc")
      expect(res.status).toBe(200)

      const body = (await res.json()) as SearchResult<Person>
      expect(body.items[0].lastName).toBe("芥川")
      expect(body.items[1].lastName).toBe("太宰")
      expect(body.items[2].lastName).toBe("夏目")
    })

    it("名前降順 — ?sort=name&order=desc → 逆読み順", async () => {
      const res = await exports.default.fetch("http://localhost/v1/persons?sort=name&order=desc")
      expect(res.status).toBe(200)

      const body = (await res.json()) as SearchResult<Person>
      expect(body.items[0].lastName).toBe("夏目")
      expect(body.items[1].lastName).toBe("太宰")
      expect(body.items[2].lastName).toBe("芥川")
    })
  })

  describe("バリデーション", () => {
    it("無効なソート — ?sort=invalid → 400", async () => {
      const res = await exports.default.fetch("http://localhost/v1/persons?sort=invalid")
      expect(res.status).toBe(400)

      const body = (await res.json()) as ErrorResponse
      expect(body.error.code).toBe("BAD_REQUEST")
    })

    it("無効なオーダー — ?order=invalid → 400", async () => {
      const res = await exports.default.fetch("http://localhost/v1/persons?order=invalid")
      expect(res.status).toBe(400)

      const body = (await res.json()) as ErrorResponse
      expect(body.error.code).toBe("BAD_REQUEST")
    })
  })

  describe("フィルタ＋ソート＋ページネーション複合", () => {
    it("名前フィルタ＋ページネーション — ?name=漱&per_page=1", async () => {
      const res = await exports.default.fetch("http://localhost/v1/persons?name=漱&per_page=1")
      expect(res.status).toBe(200)

      const body = (await res.json()) as SearchResult<Person>
      expect(body.total).toBe(1)
      expect(body.items).toHaveLength(1)
    })
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
    expect(body.page).toBe(1)
    expect(body.perPage).toBe(20)
    expect(body.items.every((w) =>
      w.authors.some((a) => a.id === "000001"),
    )).toBe(true)
  })

  it("ページネーション — ?per_page=1 → items.length=1, total=3", async () => {
    const res = await exports.default.fetch("http://localhost/v1/persons/000001/works?per_page=1")
    expect(res.status).toBe(200)

    const body = (await res.json()) as SearchResult<Work>
    expect(body.total).toBe(3)
    expect(body.items).toHaveLength(1)
    expect(body.page).toBe(1)
    expect(body.perPage).toBe(1)
  })

  it("ページネーション — ?page=2&per_page=2 → items.length=1", async () => {
    const res = await exports.default.fetch("http://localhost/v1/persons/000001/works?page=2&per_page=2")
    expect(res.status).toBe(200)

    const body = (await res.json()) as SearchResult<Work>
    expect(body.total).toBe(3)
    expect(body.items).toHaveLength(1)
    expect(body.page).toBe(2)
    expect(body.perPage).toBe(2)
  })

  it("404 — 存在しない人物の著作", async () => {
    const res = await exports.default.fetch("http://localhost/v1/persons/999999/works")
    expect(res.status).toBe(404)

    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("NOT_FOUND")
  })
})
