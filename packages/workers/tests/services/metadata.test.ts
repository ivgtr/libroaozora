import { describe, it, expect, beforeEach } from "vitest"
import { env, exports } from "cloudflare:workers"
import type { ErrorResponse } from "@libroaozora/core"
import {
  SEED_WORKS, SEED_PERSONS, SEED_SYNCED_AT, SEED_METADATA_JSON,
  METADATA_R2_KEY, META_WORKS_KEY, META_PERSONS_KEY, META_SYNCED_AT_KEY,
} from "../fixtures/seed"

import {
  getMetadata,
  getWorks,
  getPersons,
} from "../../src/services/metadata"

beforeEach(async () => {
  await env.KV.delete(META_WORKS_KEY)
  await env.KV.delete(META_PERSONS_KEY)
  await env.KV.delete(META_SYNCED_AT_KEY)
  await env.R2.delete(METADATA_R2_KEY)
})

describe("getMetadata", () => {
  it("KV にデータがある場合キャッシュから返す（syncedAt 含む）", async () => {
    await env.KV.put(META_WORKS_KEY, JSON.stringify(SEED_WORKS))
    await env.KV.put(META_PERSONS_KEY, JSON.stringify(SEED_PERSONS))
    await env.KV.put(META_SYNCED_AT_KEY, SEED_SYNCED_AT)

    const result = await getMetadata(env)

    expect(result.works).toEqual(SEED_WORKS)
    expect(result.persons).toEqual(SEED_PERSONS)
    expect(result.syncedAt).toBe(SEED_SYNCED_AT)
  })

  it("KV に syncedAt がない場合 null を返す", async () => {
    await env.KV.put(META_WORKS_KEY, JSON.stringify(SEED_WORKS))
    await env.KV.put(META_PERSONS_KEY, JSON.stringify(SEED_PERSONS))

    const result = await getMetadata(env)

    expect(result.works).toEqual(SEED_WORKS)
    expect(result.syncedAt).toBeNull()
  })

  it("KV ミス + R2 ヒット → スナップショット全体を復元（syncedAt 含む）", async () => {
    await env.R2.put(METADATA_R2_KEY, SEED_METADATA_JSON)

    const result = await getMetadata(env)

    expect(result.works).toEqual(SEED_WORKS)
    expect(result.persons).toEqual(SEED_PERSONS)
    expect(result.syncedAt).toBe(SEED_SYNCED_AT)

    const storedWorks = await env.KV.get<unknown[]>(META_WORKS_KEY, "json")
    expect(storedWorks).toEqual(SEED_WORKS)

    const storedSyncedAt = await env.KV.get(META_SYNCED_AT_KEY)
    expect(storedSyncedAt).toBe(SEED_SYNCED_AT)
  })

  it("KV ミス + R2 ヒット + KV 書き戻し → R2 は削除しない", async () => {
    await env.R2.put(METADATA_R2_KEY, SEED_METADATA_JSON)

    const result = await getMetadata(env)

    expect(result.works).toEqual(SEED_WORKS)

    const r2Object = await env.R2.get(METADATA_R2_KEY)
    expect(r2Object).not.toBeNull()
  })

  it("R2 JSON 破損 → R2 削除 → 503 SERVICE_UNAVAILABLE", async () => {
    await env.R2.put(METADATA_R2_KEY, "invalid json{{{")

    const res = await exports.default.fetch("http://localhost/v1/works")
    expect(res.status).toBe(503)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE")

    const r2Object = await env.R2.get(METADATA_R2_KEY)
    expect(r2Object).toBeNull()
  })

  it("KV + R2 ミス → 503 SERVICE_UNAVAILABLE", async () => {
    const res = await exports.default.fetch("http://localhost/v1/works")
    expect(res.status).toBe(503)
    const body = (await res.json()) as ErrorResponse
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE")
  })
})

describe("getWorks", () => {
  it("getMetadata 経由で works を返す", async () => {
    await env.KV.put(META_WORKS_KEY, JSON.stringify(SEED_WORKS))
    await env.KV.put(META_PERSONS_KEY, JSON.stringify(SEED_PERSONS))

    const works = await getWorks(env)

    expect(works).toEqual(SEED_WORKS)
  })
})

describe("getPersons", () => {
  it("getMetadata 経由で persons を返す", async () => {
    await env.KV.put(META_WORKS_KEY, JSON.stringify(SEED_WORKS))
    await env.KV.put(META_PERSONS_KEY, JSON.stringify(SEED_PERSONS))

    const persons = await getPersons(env)

    expect(persons).toEqual(SEED_PERSONS)
  })
})
