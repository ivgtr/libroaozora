import type { Context } from "hono"
import { throwHttpError } from "../errors"

export function parsePagination(c: Context): { page: number; perPage: number } {
  const page = Number(c.req.query("page") ?? "1")
  const perPage = Number(c.req.query("per_page") ?? "20")

  if (!Number.isInteger(page) || page < 1) {
    throwHttpError("BAD_REQUEST", "page must be a positive integer")
  }
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
    throwHttpError(
      "BAD_REQUEST",
      "per_page must be an integer between 1 and 100",
    )
  }

  return { page, perPage }
}
