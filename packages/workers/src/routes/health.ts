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
    const { works, persons, syncedAt, generation, state } = await getMetadata(c.env, c.executionCtx)

    return c.json({
      status: "ok",
      metadataGeneration: generation,
      metadataState: state,
      syncAgeSeconds: syncedAt ? Math.max(0, (Date.now() - Date.parse(syncedAt)) / 1000) : null,
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
  const { works, persons, syncedAt, generation, state } = await getMetadata(c.env, c.executionCtx)

  const publicDomainWorks = works.filter((w) => !w.copyrightFlag).length

  return c.json({
    metadataGeneration: generation,
    metadataState: state,
    totalWorks: works.length,
    publicDomainWorks,
    totalPersons: persons.length,
    lastUpdatedAt: syncedAt,
  })
})

export { health }
