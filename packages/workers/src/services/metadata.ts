import type { Work, Person } from "@libroaozora/core"
import { sha256 } from "@libroaozora/core"
import type { Env } from "../env"
import { throwHttpError } from "../errors"
import { METADATA_R2_KEY } from "../lib/constants"
import { within } from "./content-limits"
import { CURRENT_KEY, metadataKey, snapshotKey, parsePointer, parseSnapshot, validateData } from "./metadata-model"
import type { Pointer, Reference, Snapshot } from "./metadata-model"

export type Metadata = {
  works: Work[]
  persons: Person[]
  syncedAt: string | null
  generation: string
  state: "current" | "previous" | "legacy"
  validatedAt: string | null
  previous: Reference | null
}
type State = {
  pointer?: Pointer | null
  checkedAt: number
  pending?: Promise<Metadata>
  last?: Metadata
  snapshots: Map<string, { snapshot: Snapshot; digest: string }>
  loads: Map<string, Promise<Snapshot>>
}
let states = new WeakMap<Env, State>()
function stateFor(env: Env): State {
  let state = states.get(env)
  if (!state) { state = { checkedAt: 0, snapshots: new Map(), loads: new Map() }; states.set(env, state) }
  return state
}
async function r2Text(env: Env, key: string): Promise<string | null> {
  const object = await within(() => env.R2.get(key), 1500)
  return object === null ? null : within(() => object.text(), 1500)
}
async function readSnapshot(env: Env, reference: Reference): Promise<Snapshot> {
  const state = stateFor(env)
  const cached = state.snapshots.get(reference.generation)
  if (cached?.digest === reference.digest) return cached.snapshot
  const key = `${reference.generation}:${reference.digest}`
  const pending = state.loads.get(key)
  if (pending) return pending
  if (state.loads.size >= 2) throw new Error("Metadata loading limit reached")
  const task = loadSnapshot(env, reference)
  state.loads.set(key, task)
  try { return await task } finally { state.loads.delete(key) }
}
async function loadSnapshot(env: Env, reference: Reference): Promise<Snapshot> {
  const state = stateFor(env)
  let snapshot: Snapshot | undefined
  try {
    const text = await within(() => env.KV.get(metadataKey(reference.generation)), 1500)
    if (text !== null) snapshot = await parseSnapshot(text, reference)
  } catch (error) { console.error("Metadata operation failed", { stage: "snapshot-kv-read", generation: reference.generation, error }) }
  if (!snapshot) {
    const text = await r2Text(env, snapshotKey(reference.generation))
    if (text === null) throw new Error("Missing metadata snapshot")
    snapshot = await parseSnapshot(text, reference)
  }
  if (state.snapshots.size >= 2) state.snapshots.delete(state.snapshots.keys().next().value!)
  state.snapshots.set(reference.generation, { snapshot, digest: reference.digest })
  return snapshot
}
export async function getMetadata(env: Env): Promise<Metadata> {
  const state = stateFor(env)
  if (state.pending) return state.pending
  const task = loadMetadata(env, state)
  state.pending = task
  try { return await task } finally { state.pending = undefined }
}
async function loadMetadata(env: Env, state: State): Promise<Metadata> {
  try {
    if (state.pointer === undefined || Date.now() - state.checkedAt >= 60_000) {
      const text = await r2Text(env, CURRENT_KEY)
      state.pointer = text === null ? null : parsePointer(text)
      state.checkedAt = Date.now()
    }
    if (state.pointer === null) {
      // Only a confirmed absent pointer permits legacy R2. Never combine old KV keys.
      const text = await r2Text(env, METADATA_R2_KEY)
      if (text === null) throw new Error("Missing legacy metadata")
      const snapshot = JSON.parse(text)
      validateData(snapshot)
      const result: Metadata = { ...snapshot, generation: `legacy-${(await sha256(text)).slice(0, 32)}`, state: "legacy", validatedAt: null, previous: null }
      state.last = result
      return result
    }
    const pointer = state.pointer!
    try {
      const snapshot = await readSnapshot(env, pointer.current)
      const result: Metadata = { ...snapshot, state: "current", validatedAt: new Date(state.checkedAt).toISOString(), previous: pointer.previous }
      state.last = result
      return result
    } catch (error) {
      console.error("Metadata current snapshot failed", { generation: pointer.current.generation, error })
      if (!pointer.previous) throw error
      const snapshot = await readSnapshot(env, pointer.previous)
      const result: Metadata = { ...snapshot, state: "previous", validatedAt: null, previous: null }
      state.last = result
      console.warn("Metadata fallback", { generation: snapshot.generation, state: "previous" })
      return result
    }
  } catch (error) {
    console.error("Metadata unavailable", { error })
    if (state.last) {
      return { ...state.last, state: state.last.state === "legacy" ? "legacy" : "previous", validatedAt: null }
    }
    throwHttpError("SERVICE_UNAVAILABLE", "Metadata unavailable")
  }
}
export async function getPreviousWork(env: Env, metadata: Metadata, workId: string): Promise<Work | undefined> {
  if (!metadata.previous) return undefined
  try { return (await readSnapshot(env, metadata.previous)).works.find(work => work.id === workId) }
  catch (error) { console.error("Previous metadata unavailable", { workId, error }); return undefined }
}
export async function getWorks(env: Env): Promise<Work[]> { return (await getMetadata(env)).works }
export async function getPersons(env: Env): Promise<Person[]> { return (await getMetadata(env)).persons }
export function resetMetadataForTesting(): void { states = new WeakMap() }
