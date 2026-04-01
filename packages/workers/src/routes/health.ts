import { Hono } from "hono"
import type { Env } from "../env"
import { getMetadata, getSyncedAt } from "../services/metadata"

const health = new Hono<{ Bindings: Env }>()

health.get("/health", async (c) => {
  const [{ works, persons }, lastSyncedAt] = await Promise.all([
    getMetadata(c.env),
    getSyncedAt(c.env),
  ])

  return c.json({
    status: "ok",
    mode: "workers",
    lastSyncedAt,
    worksCount: works.length,
    personsCount: persons.length,
  })
})

health.get("/stats", async (c) => {
  const [{ works, persons }, lastUpdatedAt] = await Promise.all([
    getMetadata(c.env),
    getSyncedAt(c.env),
  ])

  const publicDomainWorks = works.filter((w) => !w.copyrightFlag).length

  return c.json({
    totalWorks: works.length,
    publicDomainWorks,
    totalPersons: persons.length,
    lastUpdatedAt,
  })
})

export { health }
