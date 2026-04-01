import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import type { Env } from "../env"
import { getMetadata } from "../services/metadata"

const health = new Hono<{ Bindings: Env }>()

function isServiceUnavailable(e: unknown): boolean {
  return e instanceof HTTPException && e.status === 503
}

health.get("/health", async (c) => {
  try {
    const { works, persons, syncedAt } = await getMetadata(c.env)

    return c.json({
      status: "ok",
      mode: "workers",
      lastSyncedAt: syncedAt,
      worksCount: works.length,
      personsCount: persons.length,
    })
  } catch (e) {
    if (isServiceUnavailable(e)) {
      return c.json({
        status: "degraded",
        message: "Metadata not synced",
      })
    }
    throw e
  }
})

health.get("/stats", async (c) => {
  const { works, persons, syncedAt } = await getMetadata(c.env)

  const publicDomainWorks = works.filter((w) => !w.copyrightFlag).length

  return c.json({
    totalWorks: works.length,
    publicDomainWorks,
    totalPersons: persons.length,
    lastUpdatedAt: syncedAt,
  })
})

export { health }
