import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { env } from "cloudflare:workers"
import app from "../../src/index"
import { resetMetadataForTesting } from "../../src/services/metadata"
const exports = { default: { fetch: (url: string) => app.fetch(new Request(url), env) } }
import type { ErrorResponse } from "@libroaozora/core"
import {
  seedKV, METADATA_R2_KEY, META_WORKS_KEY, META_PERSONS_KEY, META_SYNCED_AT_KEY,
} from "../fixtures/seed"

describe("GET /v1/health", () => {
  describe("同期済み", () => {
    beforeAll(async () => {
  resetMetadataForTesting()
      await seedKV(env.KV, env.R2)
    })

    it("200 — status: ok + メタデータ情報", async () => {
      const res = await exports.default.fetch("http://localhost/v1/health")
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body).toMatchObject({
        status: "ok",
        mode: "workers",
        lastSyncedAt: "2026-04-01T00:00:00Z",
        worksCount: 5,
        personsCount: 3,
      })
    })
  })

  describe("未同期", () => {
    beforeEach(async () => {
  resetMetadataForTesting()
      await env.KV.delete(META_WORKS_KEY)
      await env.KV.delete(META_PERSONS_KEY)
      await env.KV.delete(META_SYNCED_AT_KEY)
      await env.R2.delete(METADATA_R2_KEY)
    })

    it("200 — status: degraded（liveness は常に 200）", async () => {
      const res = await exports.default.fetch("http://localhost/v1/health")
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body).toMatchObject({
        status: "degraded",
        message: "Metadata not synced",
      })
    })
  })
})

describe("GET /v1/stats", () => {
  describe("同期済み", () => {
    beforeAll(async () => {
  resetMetadataForTesting()
      await seedKV(env.KV, env.R2)
    })

    it("200 — 統計情報を返す", async () => {
      const res = await exports.default.fetch("http://localhost/v1/stats")
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body).toMatchObject({
        totalWorks: 5,
        publicDomainWorks: 4,
        totalPersons: 3,
        lastUpdatedAt: "2026-04-01T00:00:00Z",
      })
    })
  })

  describe("未同期", () => {
    beforeEach(async () => {
  resetMetadataForTesting()
      await env.KV.delete(META_WORKS_KEY)
      await env.KV.delete(META_PERSONS_KEY)
      await env.KV.delete(META_SYNCED_AT_KEY)
      await env.R2.delete(METADATA_R2_KEY)
    })

    it("503 — SERVICE_UNAVAILABLE", async () => {
      const res = await exports.default.fetch("http://localhost/v1/stats")
      expect(res.status).toBe(503)

      const body = (await res.json()) as ErrorResponse
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE")
    })
  })
})
