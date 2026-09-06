import { liveTask, retainTask, startTask } from "./shared-task"
import type { SharedTask, TaskLifetime } from "./shared-task"
import type { Work, Person } from "@libroaozora/core"
import { sha256 } from "@libroaozora/core"
import type { Env } from "../env"
import { throwHttpError } from "../errors"
import { METADATA_R2_KEY } from "../lib/constants"
import { within } from "./content-limits"
import { CURRENT_KEY, MIGRATED_KEY, metadataKey, snapshotKey, parsePointer, parseSnapshot, validateData } from "./metadata-model"
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
  seenV2?: boolean
  lastReference?: Reference
  checkedAt: number
  pending?: SharedTask<Metadata>
  last?: Metadata
  snapshots: Map<string, { snapshot: Snapshot; digest: string }>
  loads: Map<string, SharedTask<Snapshot>>
}
let states = new WeakMap<Env, State>()
function stateFor(env: Env): State {
  let state = states.get(env)
  if (!state) { state = { checkedAt: 0, snapshots: new Map(), loads: new Map() }; states.set(env, state) }
  return state
}
async function r2Text(env: Env, key: string, signal?: AbortSignal): Promise<string | null> {
  signal?.throwIfAborted()
  const object = await within(() => env.R2.get(key), 1500)
  signal?.throwIfAborted()
  const text = object === null ? null : await within(() => object.text(), 1500)
  signal?.throwIfAborted()
  return text
}
async function readSnapshot(env: Env, reference: Reference, lifetime?: TaskLifetime): Promise<Snapshot> {
  const state = stateFor(env)
  const cached = state.snapshots.get(reference.generation)
  if (cached?.digest === reference.digest) return cached.snapshot
  const key = `${reference.generation}:${reference.digest}`
  for (const task of state.loads.values()) liveTask(task)
  const pending = liveTask(state.loads.get(key))
  if (pending) return retainTask(pending, lifetime)
  if (state.loads.size >= 2) throw new Error("Metadata loading limit reached")
  const task = startTask(signal => loadSnapshot(env, reference, signal), 5000, () => new Error("Metadata snapshot deadline exceeded"), task => {
    if (state.loads.get(key) === task) state.loads.delete(key)
  })
  state.loads.set(key, task)
  return retainTask(task, lifetime)
}
async function loadSnapshot(env: Env, reference: Reference, signal: AbortSignal): Promise<Snapshot> {
  const state = stateFor(env)
  let snapshot: Snapshot | undefined
  try {
    const text = await within(() => env.KV.get(metadataKey(reference.generation)), 1500)
    if (text !== null) snapshot = await parseSnapshot(text, reference)
  } catch (error) { console.error("Metadata operation failed", { stage: "snapshot-kv-read", generation: reference.generation, error }) }
  signal.throwIfAborted()
  if (!snapshot) {
    const text = await r2Text(env, snapshotKey(reference.generation), signal)
    if (text === null) throw new Error("Missing metadata snapshot")
    snapshot = await parseSnapshot(text, reference)
  }
  signal.throwIfAborted()
  if (state.snapshots.size >= 2) state.snapshots.delete(state.snapshots.keys().next().value!)
  state.snapshots.set(reference.generation, { snapshot, digest: reference.digest })
  return snapshot
}
export async function getMetadata(env: Env, lifetime?: TaskLifetime): Promise<Metadata> {
  const state = stateFor(env)
  const pending = liveTask(state.pending)
  if (pending) return retainTask(pending, lifetime)
  const task = startTask(async signal => {
    // A retired request must not later publish its pointer/last state over a replacement.
    const candidate = { ...state }
    try { return await loadMetadata(env, candidate, lifetime, signal) }
    finally {
      if (candidate.seenV2) {
        state.seenV2 = true
        if (signal.aborted && state.pointer === null) state.pointer = undefined
      }
      if (!signal.aborted && state.pending === task) {
        state.pointer = candidate.pointer
        state.checkedAt = candidate.checkedAt
        state.last = candidate.last
        state.lastReference = candidate.lastReference
      }
    }
  }, 20_000, () => {
    try { throwHttpError("SERVICE_UNAVAILABLE", "Metadata deadline exceeded") } catch (error) { return error as Error }
  }, task => {
    if (state.pending === task) state.pending = undefined
  })
  state.pending = task
  return retainTask(task, lifetime)
}

function knownVersionedMetadata(state: State): Metadata | undefined {
  const reference = state.lastReference
  const matches = (candidate: Reference | null) => candidate && reference && candidate.generation === reference.generation && candidate.digest === reference.digest
  if (!state.last || !state.pointer || (!matches(state.pointer.current) && !matches(state.pointer.previous))) return undefined
  return { ...state.last, state: "previous", validatedAt: null }
}
async function loadMetadata(env: Env, state: State, lifetime: TaskLifetime | undefined, signal: AbortSignal): Promise<Metadata> {
  try {
    if (state.pointer === undefined || Date.now() - state.checkedAt >= 60_000) {
      let text: string | null
      try { text = await r2Text(env, CURRENT_KEY, signal) }
      catch (error) {
        const known = knownVersionedMetadata(state)
        if (!known) throw error
        console.warn("Metadata pointer transport failed", { error, generation: known.generation })
        return known
      }
      if (text === null && state.seenV2) {
        // Missing after migration is an outage, never permission to reopen legacy data.
        const known = knownVersionedMetadata(state)
        if (known) return known
        throw new Error("Migrated metadata pointer missing")
      }
      if (text !== null) state.seenV2 = true
      state.pointer = text === null ? null : parsePointer(text)
      state.checkedAt = Date.now()
    }
    if (state.pointer === null) {
      // A durable marker also protects cold isolates after the pointer disappears.
      if (await r2Text(env, MIGRATED_KEY, signal) !== null) {
        state.seenV2 = true
        state.pointer = undefined // Do not retain a cached absence after migration.
        // Publication may have completed since we cached the missing pointer.
        // Refresh once in this shared request before declaring an outage.
        const text = await r2Text(env, CURRENT_KEY, signal)
        if (text === null) throw new Error("Migrated metadata pointer missing")
        state.pointer = parsePointer(text)
        state.checkedAt = Date.now()
      } else {
        const text = await r2Text(env, METADATA_R2_KEY, signal)
        if (text === null) throw new Error("Missing legacy metadata")
        const snapshot = JSON.parse(text)
        validateData(snapshot)
        const result: Metadata = { ...snapshot, generation: `legacy-${(await sha256(text)).slice(0, 32)}`, state: "legacy", validatedAt: null, previous: null }
        state.last = result
        return result
      }
    }
    signal.throwIfAborted()
    const pointer = state.pointer!
    try {
      const snapshot = await readSnapshot(env, pointer.current, lifetime)
      const result: Metadata = { ...snapshot, state: "current", validatedAt: new Date(state.checkedAt).toISOString(), previous: pointer.previous }
      state.last = result
      state.lastReference = pointer.current
      return result
    } catch (error) {
      console.error("Metadata current snapshot failed", { generation: pointer.current.generation, error })
      signal.throwIfAborted()
      if (!pointer.previous) throw error
      const snapshot = await readSnapshot(env, pointer.previous, lifetime)
      const result: Metadata = { ...snapshot, state: "previous", validatedAt: null, previous: null }
      state.last = result
      state.lastReference = pointer.previous
      console.warn("Metadata fallback", { generation: snapshot.generation, state: "previous" })
      return result
    }
  } catch (error) {
    console.error("Metadata unavailable", { error })
    throwHttpError("SERVICE_UNAVAILABLE", "Metadata unavailable")
  }
}
export async function getPreviousWork(env: Env, metadata: Metadata, workId: string, lifetime?: TaskLifetime): Promise<Work | undefined> {
  if (!metadata.previous) return undefined
  try { return (await readSnapshot(env, metadata.previous, lifetime)).works.find(work => work.id === workId) }
  catch (error) { console.error("Previous metadata unavailable", { workId, error }); return undefined }
}
export async function getWorks(env: Env, lifetime?: TaskLifetime): Promise<Work[]> { return (await getMetadata(env, lifetime)).works }
export async function getPersons(env: Env, lifetime?: TaskLifetime): Promise<Person[]> { return (await getMetadata(env, lifetime)).persons }
export function resetMetadataForTesting(): void { states = new WeakMap() }
