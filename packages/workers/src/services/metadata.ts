import { liveTask, retainTask, startTask } from "./shared-task"
import type { SharedTask, TaskLifetime } from "./shared-task"
import type { Work, Person } from "@libroaozora/core"
import type { Env } from "../env"
import { within } from "./content-limits"
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

const pendingMetadata = new WeakMap<Env, SharedTask<Metadata>>()
export async function getMetadata(env: Env, lifetime?: TaskLifetime): Promise<Metadata> {
  const pending = liveTask(pendingMetadata.get(env))
  if (pending) return retainTask(pending, lifetime)
  const task = startTask(() => loadMetadata(env), 5000, () => {
    try { throwHttpError("SERVICE_UNAVAILABLE", "Metadata deadline exceeded") } catch (error) { return error as Error }
  }, task => {
    if (pendingMetadata.get(env) === task) pendingMetadata.delete(env)
  })
  pendingMetadata.set(env, task)
  return retainTask(task, lifetime)
}

async function loadMetadata(env: Env): Promise<Metadata> {
  try {
    const [cachedWorks, cachedPersons, cachedSyncedAt] = await within(() => Promise.all([
      env.KV.get<Work[]>(META_WORKS_KEY, "json"),
      env.KV.get<Person[]>(META_PERSONS_KEY, "json"),
      env.KV.get(META_SYNCED_AT_KEY),
    ]), 1500)
    if (Array.isArray(cachedWorks) && Array.isArray(cachedPersons)) {
      return { works: cachedWorks, persons: cachedPersons, syncedAt: cachedSyncedAt }
    }
  } catch (error) {
    console.error("Metadata operation failed", { stage: "kv-read", error })
  }

  let r2Object
  try {
    r2Object = await within(() => env.R2.get(METADATA_R2_KEY), 1500)
  } catch (error) {
    console.error("Metadata operation failed", { stage: "r2-read", error })
    throwHttpError("SERVICE_UNAVAILABLE", "Metadata unavailable")
  }
  if (r2Object !== null) {
    let text: string
    try {
      text = await within(() => r2Object!.text(), 1500)
    } catch (error) {
      console.error("Metadata operation failed", { stage: "r2-body", error })
      throwHttpError("SERVICE_UNAVAILABLE", "Metadata unavailable")
    }
    let snapshot: MetadataSnapshot
    try {
      snapshot = parseMetadataJson(text)
    } catch (e) {
      console.error("Metadata operation failed", { stage: "json-parse", error: e })
      throwHttpError("SERVICE_UNAVAILABLE", "Metadata not synced")
    }

    try {
      await within(() => Promise.all([
        env.KV.put(META_WORKS_KEY, JSON.stringify(snapshot.works), { expirationTtl: METADATA_TTL }),
        env.KV.put(META_PERSONS_KEY, JSON.stringify(snapshot.persons), { expirationTtl: METADATA_TTL }),
        env.KV.put(META_SYNCED_AT_KEY, snapshot.syncedAt),
      ]), 500)
    } catch (error) {
      console.error("Metadata operation failed", { stage: "kv-write", error })
    }

    return snapshot
  }

  throwHttpError("SERVICE_UNAVAILABLE", "Metadata not synced")
}

export async function getWorks(env: Env, lifetime?: TaskLifetime): Promise<Work[]> {
  const { works } = await getMetadata(env, lifetime)
  return works
}

export async function getPersons(env: Env, lifetime?: TaskLifetime): Promise<Person[]> {
  const { persons } = await getMetadata(env, lifetime)
  return persons
}
