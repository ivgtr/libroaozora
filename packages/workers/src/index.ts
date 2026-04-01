import { Hono } from "hono"
import type { Env } from "./env"
import { onErrorHandler } from "./errors"
import { works } from "./routes/works"
import { persons } from "./routes/persons"
import { health } from "./routes/health"
import { syncMetadata } from "./services/metadata"

const app = new Hono<{ Bindings: Env }>()

app.onError(onErrorHandler)

app.route("/v1", works)
app.route("/v1", persons)
app.route("/v1", health)

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(syncMetadata(env.KV))
  },
}
