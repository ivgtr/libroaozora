import { describe, it, expect, vi, beforeEach } from "vitest"
import { env } from "cloudflare:workers"
import { SEED_WORKS, SEED_PERSONS, SEED_SYNCED_AT } from "../fixtures/seed"

vi.mock("../../src/lib/csv-fetcher", () => ({
  fetchAndParseCSV: vi.fn(),
}))

import {
  getMetadata,
  getWorks,
  getPersons,
  getSyncedAt,
  syncMetadata,
} from "../../src/services/metadata"
import { fetchAndParseCSV } from "../../src/lib/csv-fetcher"

const mockFetchAndParseCSV = vi.mocked(fetchAndParseCSV)

beforeEach(async () => {
  vi.clearAllMocks()
  await env.KV.delete("meta:works")
  await env.KV.delete("meta:persons")
  await env.KV.delete("meta:syncedAt")
})

describe("getMetadata", () => {
  it("KV にデータがある場合キャッシュから返す", async () => {
    await env.KV.put("meta:works", JSON.stringify(SEED_WORKS))
    await env.KV.put("meta:persons", JSON.stringify(SEED_PERSONS))

    const result = await getMetadata(env.KV)

    expect(result.works).toEqual(SEED_WORKS)
    expect(result.persons).toEqual(SEED_PERSONS)
    expect(mockFetchAndParseCSV).not.toHaveBeenCalled()
  })

  it("KV が空の場合 CSV を取得し KV に書き込む", async () => {
    mockFetchAndParseCSV.mockResolvedValue({
      works: SEED_WORKS,
      persons: SEED_PERSONS,
    })

    const result = await getMetadata(env.KV)

    expect(mockFetchAndParseCSV).toHaveBeenCalledOnce()
    expect(result.works).toEqual(SEED_WORKS)
    expect(result.persons).toEqual(SEED_PERSONS)

    const storedWorks = await env.KV.get<unknown[]>("meta:works", "json")
    const storedPersons = await env.KV.get<unknown[]>("meta:persons", "json")
    const storedSyncedAt = await env.KV.get("meta:syncedAt")

    expect(storedWorks).toEqual(SEED_WORKS)
    expect(storedPersons).toEqual(SEED_PERSONS)
    expect(storedSyncedAt).not.toBeNull()
  })
})

describe("getWorks", () => {
  it("getMetadata 経由で works を返す", async () => {
    await env.KV.put("meta:works", JSON.stringify(SEED_WORKS))
    await env.KV.put("meta:persons", JSON.stringify(SEED_PERSONS))

    const works = await getWorks(env.KV)

    expect(works).toEqual(SEED_WORKS)
  })
})

describe("getPersons", () => {
  it("getMetadata 経由で persons を返す", async () => {
    await env.KV.put("meta:works", JSON.stringify(SEED_WORKS))
    await env.KV.put("meta:persons", JSON.stringify(SEED_PERSONS))

    const persons = await getPersons(env.KV)

    expect(persons).toEqual(SEED_PERSONS)
  })
})

describe("getSyncedAt", () => {
  it("KV に値がある場合タイムスタンプを返す", async () => {
    await env.KV.put("meta:syncedAt", SEED_SYNCED_AT)

    const result = await getSyncedAt(env.KV)

    expect(result).toBe(SEED_SYNCED_AT)
  })

  it("KV が空の場合 null を返す", async () => {
    const result = await getSyncedAt(env.KV)

    expect(result).toBeNull()
  })
})

describe("syncMetadata", () => {
  it("CSV を取得し全メタデータキーを KV に書き込む", async () => {
    mockFetchAndParseCSV.mockResolvedValue({
      works: SEED_WORKS,
      persons: SEED_PERSONS,
    })

    await syncMetadata(env.KV)

    expect(mockFetchAndParseCSV).toHaveBeenCalledOnce()

    const storedWorks = await env.KV.get<unknown[]>("meta:works", "json")
    const storedPersons = await env.KV.get<unknown[]>("meta:persons", "json")
    const storedSyncedAt = await env.KV.get("meta:syncedAt")

    expect(storedWorks).toEqual(SEED_WORKS)
    expect(storedPersons).toEqual(SEED_PERSONS)
    expect(storedSyncedAt).not.toBeNull()
  })
})
