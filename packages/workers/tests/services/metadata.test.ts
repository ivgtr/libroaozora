import { describe, it, expect, vi, beforeEach } from "vitest"
import { env } from "cloudflare:workers"
import { SEED_WORKS, SEED_PERSONS, SEED_SYNCED_AT, SEED_METADATA_ZIP, METADATA_R2_KEY } from "../fixtures/seed"

vi.mock("../../src/lib/csv-fetcher", () => ({
  fetchCSVZip: vi.fn(),
  parseCSVZip: vi.fn(),
}))

import {
  getMetadata,
  getWorks,
  getPersons,
  getSyncedAt,
  syncMetadata,
} from "../../src/services/metadata"
import { fetchCSVZip, parseCSVZip } from "../../src/lib/csv-fetcher"

const mockFetchCSVZip = vi.mocked(fetchCSVZip)
const mockParseCSVZip = vi.mocked(parseCSVZip)

beforeEach(async () => {
  vi.clearAllMocks()
  await env.KV.delete("meta:works")
  await env.KV.delete("meta:persons")
  await env.KV.delete("meta:syncedAt")
  await env.R2.delete(METADATA_R2_KEY)
})

describe("getMetadata", () => {
  it("KV にデータがある場合キャッシュから返す", async () => {
    await env.KV.put("meta:works", JSON.stringify(SEED_WORKS))
    await env.KV.put("meta:persons", JSON.stringify(SEED_PERSONS))

    const result = await getMetadata(env)

    expect(result.works).toEqual(SEED_WORKS)
    expect(result.persons).toEqual(SEED_PERSONS)
    expect(mockFetchCSVZip).not.toHaveBeenCalled()
    expect(mockParseCSVZip).not.toHaveBeenCalled()
  })

  it("KV ミス + R2 ヒット → parseCSVZip で復元し KV に書き込む（syncedAt は更新しない）", async () => {
    await env.R2.put(METADATA_R2_KEY, SEED_METADATA_ZIP)
    mockParseCSVZip.mockReturnValue({
      works: SEED_WORKS,
      persons: SEED_PERSONS,
    })

    const result = await getMetadata(env)

    expect(mockParseCSVZip).toHaveBeenCalledOnce()
    expect(mockFetchCSVZip).not.toHaveBeenCalled()
    expect(result.works).toEqual(SEED_WORKS)
    expect(result.persons).toEqual(SEED_PERSONS)

    const storedWorks = await env.KV.get<unknown[]>("meta:works", "json")
    expect(storedWorks).toEqual(SEED_WORKS)

    // R2 復元時は syncedAt を更新しない（実際の同期時刻ではないため）
    const storedSyncedAt = await env.KV.get("meta:syncedAt")
    expect(storedSyncedAt).toBeNull()
  })

  it("R2 データ破損 → R2 削除 → GitHub フォールバック", async () => {
    await env.R2.put(METADATA_R2_KEY, SEED_METADATA_ZIP)

    const rawZip = new Uint8Array([1, 2, 3, 4])
    mockParseCSVZip
      .mockImplementationOnce(() => { throw new Error("corrupt zip") })
      .mockReturnValue({ works: SEED_WORKS, persons: SEED_PERSONS })
    mockFetchCSVZip.mockResolvedValue(rawZip)

    const result = await getMetadata(env)

    expect(mockFetchCSVZip).toHaveBeenCalledOnce()
    expect(result.works).toEqual(SEED_WORKS)
    expect(result.persons).toEqual(SEED_PERSONS)

    const storedWorks = await env.KV.get<unknown[]>("meta:works", "json")
    expect(storedWorks).toEqual(SEED_WORKS)
  })

  it("KV + R2 ミス → GitHub fetch → R2 + KV に書き込む", async () => {
    const rawZip = new Uint8Array([1, 2, 3, 4])
    mockFetchCSVZip.mockResolvedValue(rawZip)
    mockParseCSVZip.mockReturnValue({
      works: SEED_WORKS,
      persons: SEED_PERSONS,
    })

    const result = await getMetadata(env)

    expect(mockFetchCSVZip).toHaveBeenCalledOnce()
    expect(mockParseCSVZip).toHaveBeenCalledOnce()
    expect(result.works).toEqual(SEED_WORKS)
    expect(result.persons).toEqual(SEED_PERSONS)

    const r2Object = await env.R2.get(METADATA_R2_KEY)
    expect(r2Object).not.toBeNull()

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

    const works = await getWorks(env)

    expect(works).toEqual(SEED_WORKS)
  })
})

describe("getPersons", () => {
  it("getMetadata 経由で persons を返す", async () => {
    await env.KV.put("meta:works", JSON.stringify(SEED_WORKS))
    await env.KV.put("meta:persons", JSON.stringify(SEED_PERSONS))

    const persons = await getPersons(env)

    expect(persons).toEqual(SEED_PERSONS)
  })
})

describe("getSyncedAt", () => {
  it("KV に値がある場合タイムスタンプを返す", async () => {
    await env.KV.put("meta:syncedAt", SEED_SYNCED_AT)

    const result = await getSyncedAt(env)

    expect(result).toBe(SEED_SYNCED_AT)
  })

  it("KV が空の場合 null を返す", async () => {
    const result = await getSyncedAt(env)

    expect(result).toBeNull()
  })
})

describe("syncMetadata", () => {
  it("GitHub fetch → R2 + KV に書き込む", async () => {
    const rawZip = new Uint8Array([1, 2, 3, 4])
    mockFetchCSVZip.mockResolvedValue(rawZip)
    mockParseCSVZip.mockReturnValue({
      works: SEED_WORKS,
      persons: SEED_PERSONS,
    })

    await syncMetadata(env)

    expect(mockFetchCSVZip).toHaveBeenCalledOnce()
    expect(mockParseCSVZip).toHaveBeenCalledOnce()

    const r2Object = await env.R2.get(METADATA_R2_KEY)
    expect(r2Object).not.toBeNull()

    const storedWorks = await env.KV.get<unknown[]>("meta:works", "json")
    const storedPersons = await env.KV.get<unknown[]>("meta:persons", "json")
    const storedSyncedAt = await env.KV.get("meta:syncedAt")

    expect(storedWorks).toEqual(SEED_WORKS)
    expect(storedPersons).toEqual(SEED_PERSONS)
    expect(storedSyncedAt).not.toBeNull()
  })
})
