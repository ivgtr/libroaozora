import type { Work, Person } from "@libroaozora/core"
import { fetchAndParseCSV } from "../lib/csv-fetcher"

const TTL = 86400

async function writeMetadata(
  kv: KVNamespace,
  works: Work[],
  persons: Person[],
): Promise<void> {
  await Promise.all([
    kv.put("meta:works", JSON.stringify(works), { expirationTtl: TTL }),
    kv.put("meta:persons", JSON.stringify(persons), { expirationTtl: TTL }),
    kv.put("meta:syncedAt", new Date().toISOString(), { expirationTtl: TTL }),
  ])
}

export async function getMetadata(
  kv: KVNamespace,
): Promise<{ works: Work[]; persons: Person[] }> {
  const [cachedWorks, cachedPersons] = await Promise.all([
    kv.get<Work[]>("meta:works", "json"),
    kv.get<Person[]>("meta:persons", "json"),
  ])
  if (cachedWorks !== null && cachedPersons !== null) {
    return { works: cachedWorks, persons: cachedPersons }
  }

  const { works, persons } = await fetchAndParseCSV()
  await writeMetadata(kv, works, persons)
  return { works, persons }
}

export async function getWorks(kv: KVNamespace): Promise<Work[]> {
  const { works } = await getMetadata(kv)
  return works
}

export async function getPersons(kv: KVNamespace): Promise<Person[]> {
  const { persons } = await getMetadata(kv)
  return persons
}

export async function getSyncedAt(kv: KVNamespace): Promise<string | null> {
  return kv.get("meta:syncedAt")
}

export async function syncMetadata(kv: KVNamespace): Promise<void> {
  const { works, persons } = await fetchAndParseCSV()
  await writeMetadata(kv, works, persons)
}
