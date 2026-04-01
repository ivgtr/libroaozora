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
}

export function throwHttpError(code: ErrorCode, message: string): never {
  const body = createErrorResponse(code, message)
  const status = (statusMap[code] ?? 500) as ContentfulStatusCode
  throw new HTTPException(status, {
    res: new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  })
}

export function onErrorHandler(err: Error, c: Context): Response {
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  const body = createErrorResponse("INTERNAL_ERROR", "Internal server error")
  return c.json(body, 500)
}
