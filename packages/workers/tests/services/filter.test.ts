import { describe, it, expect } from "vitest"
import { filterWorks, sortWorks, paginate } from "../../src/services/filter"
import { SEED_WORKS } from "../fixtures/seed"

const [W1, W2, W3, W4, W5] = SEED_WORKS

describe("filterWorks", () => {
  it("title 前方一致", () => {
    const result = filterWorks(SEED_WORKS, { title: "吾輩" })
    expect(result).toEqual([W1, W3])
  })

  it("title 大文字小文字区別なし（日本語そのまま一致）", () => {
    const result = filterWorks(SEED_WORKS, { title: "吾輩は猫" })
    expect(result).toEqual([W1])
  })

  it("author 部分一致（lastName+firstName）", () => {
    const result = filterWorks(SEED_WORKS, { author: "夏目漱石" })
    expect(result).toEqual([W1, W3, W5])
  })

  it("person_id 完全一致", () => {
    const result = filterWorks(SEED_WORKS, { person_id: "000002" })
    expect(result).toEqual([W2, W4])
  })

  it("ndc 前方一致", () => {
    const result = filterWorks(SEED_WORKS, { ndc: "91" })
    expect(result).toEqual([W1, W2, W3])
  })

  it("ndc 完全な分類番号で前方一致", () => {
    const result = filterWorks(SEED_WORKS, { ndc: "913" })
    expect(result).toEqual([W1, W3])
  })

  it("orthography 完全一致", () => {
    const result = filterWorks(SEED_WORKS, { orthography: "新字新仮名" })
    expect(result).toEqual([W1, W3])
  })

  it("published_after — publishedAt >= 指定日", () => {
    const result = filterWorks(SEED_WORKS, { published_after: "2005-01-01" })
    expect(result).toEqual([W2, W3, W4, W5])
  })

  it("published_before — publishedAt <= 指定日", () => {
    const result = filterWorks(SEED_WORKS, { published_before: "2005-12-31" })
    expect(result).toEqual([W1, W2])
  })

  it("copyright flag true", () => {
    const result = filterWorks(SEED_WORKS, { copyright: "true" })
    expect(result).toEqual([W4])
  })

  it("copyright flag false", () => {
    const result = filterWorks(SEED_WORKS, { copyright: "false" })
    expect(result).toEqual([W1, W2, W3, W5])
  })

  it("複合フィルタ", () => {
    const result = filterWorks(SEED_WORKS, { title: "吾輩", person_id: "000001" })
    expect(result).toEqual([W1, W3])
  })

  it("一致なし — 空配列を返す", () => {
    const result = filterWorks(SEED_WORKS, { title: "存在しない" })
    expect(result).toEqual([])
  })
})

describe("sortWorks", () => {
  it("published_at desc（デフォルト）— 新しい順", () => {
    const result = sortWorks(SEED_WORKS)
    expect(result.map((w) => w.id)).toEqual(["004000", "003000", "005000", "002000", "001000"])
  })

  it("published_at asc — 古い順", () => {
    const result = sortWorks(SEED_WORKS, undefined, "asc")
    expect(result.map((w) => w.id)).toEqual(["001000", "002000", "005000", "003000", "004000"])
  })

  it("updated_at desc — updatedAt の新しい順", () => {
    const result = sortWorks(SEED_WORKS, "updated_at")
    expect(result.map((w) => w.id)).toEqual(["003000", "004000", "002000", "005000", "001000"])
  })
})

describe("paginate", () => {
  it("page=1, perPage=2", () => {
    const result = paginate(SEED_WORKS, 1, 2)
    expect(result).toEqual({
      total: 5,
      page: 1,
      perPage: 2,
      items: [W1, W2],
    })
  })

  it("page=2, perPage=2", () => {
    const result = paginate(SEED_WORKS, 2, 2)
    expect(result).toEqual({
      total: 5,
      page: 2,
      perPage: 2,
      items: [W3, W4],
    })
  })

  it("空配列 — items=[], total=0", () => {
    const result = paginate([], 1, 10)
    expect(result).toEqual({
      total: 0,
      page: 1,
      perPage: 10,
      items: [],
    })
  })
})
