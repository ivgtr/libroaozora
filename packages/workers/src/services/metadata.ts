import type { Work, Person } from "@libroaozora/core"
import type { Env } from "../env"
import { fetchCSVZip, parseCSVZip } from "../lib/csv-fetcher"

const TTL = 259200
const METADATA_R2_KEY = "metadata/list_person_all_extended_utf8.zip"

async function writeMetadata(
  kv: KVNamespace,
  works: Work[],
  persons: Person[],
): Promise<void> {
  await Promise.all([
    kv.put("meta:works", JSON.stringify(works), { expirationTtl: TTL }),
    kv.put("meta:persons", JSON.stringify(persons), { expirationTtl: TTL }),
  ])
}

async function restoreMetadata(
  zipData: Uint8Array,
  env: Env,
): Promise<{ works: Work[]; persons: Person[] }> {
  const { works, persons } = parseCSVZip(zipData)
  await writeMetadata(env.KV, works, persons)
  return { works, persons }
}

async function fetchAndSyncMetadata(
  env: Env,
): Promise<{ works: Work[]; persons: Person[] }> {
  const rawZip = await fetchCSVZip()
  const result = await restoreMetadata(rawZip, env)

  try {
    await env.R2.put(METADATA_R2_KEY, rawZip)
  } catch {
    // best-effort: R2 write failure does not block
  }

  await env.KV.put("meta:syncedAt", new Date().toISOString())

  return result
}

export async function getMetadata(
  env: Env,
): Promise<{ works: Work[]; persons: Person[] }> {
  const [cachedWorks, cachedPersons] = await Promise.all([
    env.KV.get<Work[]>("meta:works", "json"),
    env.KV.get<Person[]>("meta:persons", "json"),
  ])
  if (cachedWorks !== null && cachedPersons !== null) {
    return { works: cachedWorks, persons: cachedPersons }
  }

  const r2Object = await env.R2.get(METADATA_R2_KEY)
  if (r2Object !== null) {
    try {
      const zipData = new Uint8Array(await r2Object.arrayBuffer())
      const { works, persons } = parseCSVZip(zipData)
      try { await writeMetadata(env.KV, works, persons) } catch {}
      return { works, persons }
    } catch {
      try { await env.R2.delete(METADATA_R2_KEY) } catch {}
    }
  }

  return fetchAndSyncMetadata(env)
}

export async function getWorks(env: Env): Promise<Work[]> {
  const { works } = await getMetadata(env)
  return works
}

export async function getPersons(env: Env): Promise<Person[]> {
  const { persons } = await getMetadata(env)
  return persons
}

export async function getSyncedAt(env: Env): Promise<string | null> {
  return env.KV.get("meta:syncedAt")
}

export async function syncMetadata(env: Env): Promise<void> {
  await fetchAndSyncMetadata(env)
}
