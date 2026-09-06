import { sha256 } from "@libroaozora/core"
import type { Work, Person } from "@libroaozora/core"
export const CURRENT_KEY = "metadata/current.json"
export type Snapshot = { schemaVersion: 1; generation: string; works: Work[]; persons: Person[]; syncedAt: string }
export type Reference = { generation: string; digest: string }
export type Pointer = { schemaVersion: 1; current: Reference; previous: Reference | null }
export const snapshotKey = (generation: string) => `metadata/snapshots/${generation}.json`
export const metadataKey = (generation: string) => `metadata:${generation}`
export function validGeneration(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9.-]{1,100}$/.test(value) }
export function validateData(value: unknown): asserts value is { works: Work[]; persons: Person[]; syncedAt: string } {
  const data = value as Partial<Snapshot> | null
  if (!data || !Array.isArray(data.works) || !Array.isArray(data.persons) || typeof data.syncedAt !== "string" || !Number.isFinite(Date.parse(data.syncedAt))) throw new Error("Invalid metadata shape")
  const ids = new Set<string>()
  for (const work of data.works) {
    if (!work || typeof work.id !== "string" || !/^\d+$/.test(work.id) || ids.has(work.id) || typeof work.title !== "string" || typeof work.copyrightFlag !== "boolean" || !Array.isArray(work.authors) || !work.sourceUrls || typeof work.sourceUrls.card !== "string") throw new Error("Invalid metadata work")
    if (work.sourceUrls.text !== undefined && (typeof work.sourceUrls.text !== "string" || !/^https?:\/\//.test(work.sourceUrls.text))) throw new Error("Invalid metadata source URL")
    if (work.sourceUrls.text && !["http:", "https:"].includes(new URL(work.sourceUrls.text).protocol)) throw new Error("Invalid source URL protocol")
    ids.add(work.id)
  }
  const personIds = new Set<string>()
  for (const person of data.persons) {
    if (!person || typeof person.id !== "string" || !/^\d+$/.test(person.id) || personIds.has(person.id) || typeof person.copyrightFlag !== "boolean") throw new Error("Invalid metadata person")
    personIds.add(person.id)
  }
}
export function parsePointer(text: string): Pointer {
  const data = JSON.parse(text) as Pointer
  const valid = (ref: Reference) => ref && validGeneration(ref.generation) && /^[0-9a-f]{64}$/.test(ref.digest)
  if (!data || data.schemaVersion !== 1 || !valid(data.current) || (data.previous !== null && !valid(data.previous)) || data.previous?.generation === data.current.generation) throw new Error("Invalid metadata pointer")
  return data
}
export async function parseSnapshot(text: string, reference: Reference): Promise<Snapshot> {
  if (!validGeneration(reference.generation)) throw new Error("Invalid generation")
  if (await sha256(text) !== reference.digest) throw new Error("Metadata digest mismatch")
  const data = JSON.parse(text) as Snapshot
  validateData(data)
  if (data.schemaVersion !== 1 || data.generation !== reference.generation) throw new Error("Metadata generation mismatch")
  return data
}
