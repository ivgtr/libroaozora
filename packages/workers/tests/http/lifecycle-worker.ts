// Test-only entry point: real API, real KV/R2, controlled I/O barriers.
import app from "../../src/index"
import type { Env } from "../../src/env"
import { shareContent } from "../../src/services/content-control"

type TestEnv = Env & { GATE: Fetcher; PHASE: string; RETAIN_TASKS: string }
const bindings = new WeakMap<TestEnv, Env>()
let blocked = false, retained = 0
function adapted(env: TestEnv): Env {
  let result = bindings.get(env)
  if (result) return result
  const pause = async (phase: string) => {
    if (blocked || env.PHASE !== phase) return
    blocked = true
    await env.GATE.fetch("http://gate/block")
  }
  result = { ...env,
    KV: new Proxy(env.KV, { get(target, name) {
      if (name === "get") return async (key: string, ...args: unknown[]) => {
        await pause(key.startsWith("content:") ? "content-kv" : "metadata-kv")
        return Reflect.apply(target.get, target, [key, ...args])
      }
      const value = Reflect.get(target, name)
      return typeof value === "function" ? value.bind(target) : value
    } }),
    R2: new Proxy(env.R2, { get(target, name) {
      if (name === "get") return async (key: string, ...args: unknown[]) => {
        await pause(key.startsWith("metadata/") ? "metadata-r2" : "content-r2")
        const object = await Reflect.apply(target.get, target, [key, ...args]) as R2ObjectBody | null
        if (!object) return object
        return new Proxy(object, { get(target, name) {
          if (name === "body" && env.PHASE === "content-body") {
            const reader = target.body.getReader()
            return new ReadableStream({
              async start(controller) {
                await pause("content-body")
                try {
                  while (true) {
                    const { value, done } = await reader.read()
                    if (done) break
                    controller.enqueue(value)
                  }
                  controller.close()
                } catch (error) { controller.error(error) }
              },
              cancel(reason) { return reader.cancel(reason) },
            })
          }
          if (name === "text") return async () => { await pause("metadata-body"); return target.text() }
          const value = Reflect.get(target, name)
          return typeof value === "function" ? value.bind(target) : value
        } })
      }
      const value = Reflect.get(target, name)
      return typeof value === "function" ? value.bind(target) : value
    } }),
  }
  bindings.set(env, result)
  return result
}
export default {
  async fetch(request: Request, env: TestEnv, ctx: ExecutionContext) {
    const bound = adapted(env)
    const lifetime = { ...ctx, waitUntil(promise: Promise<unknown>) { retained++; if (env.RETAIN_TASKS !== "false") ctx.waitUntil(promise) }, passThroughOnException() { ctx.passThroughOnException() } }
    const path = new URL(request.url).pathname
    if (path === "/__status") return Response.json({ retained, blocked })
    if (path === "/__slot") {
      try { return Response.json(await shareContent(bound, "other-work", async () => "available", lifetime)) }
      catch { return new Response("busy", { status: 503 }) }
    }
    return app.fetch(request, bound, lifetime)
  },
}
