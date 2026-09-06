import { SourceError } from "./services/content-control"
import type { ErrorCode, ErrorResponse } from "@libroaozora/core"
import { HTTPException } from "hono/http-exception"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { Context } from "hono"

export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: unknown,
): ErrorResponse {
  const error: ErrorResponse["error"] = { code, message }
  if (details !== undefined) {
    error.details = details
  }
  return { error }
}

const statusMap: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  INTERNAL_ERROR: 500,
  NOT_SUPPORTED: 501,
  SERVICE_UNAVAILABLE: 503,
  SOURCE_UNAVAILABLE: 503,
  SOURCE_TEMPORARY_ERROR: 503,
  SOURCE_INVALID_CONTENT: 502,
}

export function throwHttpError(code: ErrorCode, message: string): never {
  const body = createErrorResponse(code, message)
  const status = (statusMap[code] ?? 500) as ContentfulStatusCode
  throw new HTTPException(status, {
    res: new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }),
  })
}

export function onErrorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  if (err instanceof SourceError) {
    const code = err.kind === "temporary" ? "SOURCE_TEMPORARY_ERROR" : err.kind === "invalid" ? "SOURCE_INVALID_CONTENT" : "SOURCE_UNAVAILABLE"
    console.error("Content delivery failed", { path: c.req.path, code, status: err.status, error: err })
    c.header("Cache-Control", "no-store")
    return c.json(createErrorResponse(code, "Content source unavailable"), err.kind === "invalid" ? 502 : 503)
  }
  console.error("Unhandled API error", { path: c.req.path, error: err })
  const body = createErrorResponse("INTERNAL_ERROR", "Internal server error")
  c.header("Cache-Control", "no-store")
  return c.json(body, 500)
}
