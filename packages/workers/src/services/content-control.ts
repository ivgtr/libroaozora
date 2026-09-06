import { liveTask, retainTask, startTask } from "./shared-task"
import type { SharedTask, TaskLifetime } from "./shared-task"
import type { Env } from "../env"

export class SourceError extends Error {
  constructor(
    message: string,
    readonly kind: "temporary" | "unavailable" | "invalid",
    readonly status?: number,
    readonly retryAfterMs = 60_000,
    options?: ErrorOptions,
  ) { super(message, options) }
}

type Result = { text: string; cacheHit: boolean }
type State = {
  active: Map<string, SharedTask<unknown>>
  cooldown: Map<string, { until: number; error: SourceError }>
}
let states = new WeakMap<Env, State>()
function stateFor(env: Env): State {
  let state = states.get(env)
  if (!state) {
    state = { active: new Map(), cooldown: new Map() }
    states.set(env, state)
  }
  for (const [key, value] of state.cooldown) {
    if (value.until <= Date.now()) state.cooldown.delete(key)
  }
  return state
}

export function retryAfterMs(value: string | null, now = Date.now()): number {
  if (value === null || !value.trim()) return 60_000
  const seconds = /^\d+$/.test(value.trim()) ? Number(value) : NaN
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now
  return Number.isFinite(delay) && delay > 0 ? Math.max(60_000, delay) : 60_000
}

export function checkCooldown(env: Env, key: string): void {
  const entry = stateFor(env).cooldown.get(key)
  if (entry) throw entry.error
}

export function recordFailure(env: Env, key: string, error: SourceError): void {
  if (error.kind !== "temporary") return
  const state = stateFor(env)
  const limit = positiveLimit(env.CONTENT_COOLDOWN_ENTRIES, 256)
  if (!state.cooldown.has(key) && state.cooldown.size >= limit) {
    state.cooldown.delete(state.cooldown.keys().next().value!)
  }
  state.cooldown.set(key, { until: Date.now() + error.retryAfterMs, error })
}

export function positiveLimit(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? n : fallback
}

export async function shareContent<T = Result>(env: Env, key: string, operation: () => Promise<T>, lifetime?: TaskLifetime): Promise<T> {
  const state = stateFor(env)
  for (const task of state.active.values()) liveTask(task)
  const existing = liveTask(state.active.get(key))
  if (existing) return retainTask(existing, lifetime) as Promise<T>
  if (state.active.size >= positiveLimit(env.CONTENT_MAX_CONCURRENT, 2)) {
    throw new SourceError("Content concurrency limit reached", "temporary")
  }
  // Leave margin below Workers' 30-second post-disconnect waitUntil window.
  const duration = Math.min(positiveLimit(env.CONTENT_TIMEOUT_MS, 20_000), 25_000)
  const task = startTask(operation, duration, () => new SourceError("Shared content deadline exceeded", "temporary"), task => {
    if (state.active.get(key) === task) state.active.delete(key)
  })
  state.active.set(key, task)
  return retainTask(task, lifetime)
}

export function resetContentControlForTesting(): void { states = new WeakMap() }
