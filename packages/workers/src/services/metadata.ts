import type { Work, Person } from "@libroaozora/core"
import type { Env } from "../env"
import { throwHttpError } from "../errors"
import {
  METADATA_R2_KEY,
  META_WORKS_KEY,
  META_PERSONS_KEY,
  META_SYNCED_AT_KEY,
  METADATA_TTL,
} from "../lib/constants"

export type Metadata = {
  works: Work[]
  persons: Person[]
  syncedAt: string | null
}

type MetadataSnapshot = {
  works: Work[]
  persons: Person[]
  syncedAt: string
}

function parseMetadataJson(text: string): MetadataSnapshot {
  const data = JSON.parse(text) as Record<string, unknown>
  if (!Array.isArray(data.works) || !Array.isArray(data.persons) || typeof data.syncedAt !== "string") {
    throw new Error("Invalid metadata shape")
  }
  return data as unknown as MetadataSnapshot
}

export async function getMetadata(env: Env): Promise<Metadata> {
  const [cachedWorks, cachedPersons, cachedSyncedAt] = await Promise.all([
    env.KV.get<Work[]>(META_WORKS_KEY, "json"),
    env.KV.get<Person[]>(META_PERSONS_KEY, "json"),
    env.KV.get(META_SYNCED_AT_KEY),
  ])
  if (cachedWorks !== null && cachedPersons !== null) {
    return { works: cachedWorks, persons: cachedPersons, syncedAt: cachedSyncedAt }
  }

  const r2Object = await env.R2.get(METADATA_R2_KEY)
  if (r2Object !== null) {
    let snapshot: MetadataSnapshot
    try {
      snapshot = parseMetadataJson(await r2Object.text())
    } catch (e) {
      console.error("R2 metadata corrupted, deleting:", e)
      try { await env.R2.delete(METADATA_R2_KEY) } catch {}
      throwHttpError("SERVICE_UNAVAILABLE", "Metadata not synced")
    }

    try {
      await Promise.all([
        env.KV.put(META_WORKS_KEY, JSON.stringify(snapshot.works), { expirationTtl: METADATA_TTL }),
        env.KV.put(META_PERSONS_KEY, JSON.stringify(snapshot.persons), { expirationTtl: METADATA_TTL }),
        env.KV.put(META_SYNCED_AT_KEY, snapshot.syncedAt),
      ])
    } catch {}

    return snapshot
  }

  throwHttpError("SERVICE_UNAVAILABLE", "Metadata not synced")
}

export async function getWorks(env: Env): Promise<Work[]> {
  const { works } = await getMetadata(env)
  return works
}

export async function getPersons(env: Env): Promise<Person[]> {
  const { persons } = await getMetadata(env)
  return persons
}
