import { describe, it, expect, vi, beforeAll } from "vitest"
import { env, exports } from "cloudflare:workers"
import { seedKV } from "../fixtures/seed"

vi.mock("../../src/lib/csv-fetcher", () => ({
  fetchCSVZip: vi.fn(),
  parseCSVZip: vi.fn(),
}))

beforeAll(async () => {
  await seedKV(env.KV)
})

describe("GET /v1/health", () => {
  it("200 — status, mode, lastSyncedAt, worksCount, personsCount を返す", async () => {
    const res = await exports.default.fetch("http://localhost/v1/health")
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual({
      status: "ok",
      mode: "workers",
      lastSyncedAt: "2026-04-01T00:00:00Z",
      worksCount: 5,
      personsCount: 3,
    })
  })
})

describe("GET /v1/stats", () => {
  it("200 — totalWorks, publicDomainWorks, totalPersons, lastUpdatedAt を返す", async () => {
    const res = await exports.default.fetch("http://localhost/v1/stats")
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual({
      totalWorks: 5,
      publicDomainWorks: 4,
      totalPersons: 3,
      lastUpdatedAt: "2026-04-01T00:00:00Z",
    })
  })
})
