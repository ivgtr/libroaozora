import { Hono } from "hono"
import type { Env } from "../env"
import { throwHttpError } from "../errors"
import { parsePagination } from "../lib/pagination"
import { getWorks } from "../services/metadata"
import { filterWorks, sortWorks, paginate } from "../services/filter"
import type { FilterParams } from "../services/filter"
import { getContent } from "../services/content"
import { formatContent } from "@libroaozora/core"
import type { ContentFormat } from "@libroaozora/core"

const works = new Hono<{ Bindings: Env }>()

// T010: GET /works (works list with filtering)
works.get("/works", async (c) => {
  const { page, perPage } = parsePagination(c)
  const sort = c.req.query("sort")
  const order = c.req.query("order")

  if (c.req.query("q") !== undefined) {
    throwHttpError(
      "NOT_SUPPORTED",
      "Full-text search is not available. Use aozora-server for FTS.",
    )
  }
  if (
    c.req.query("char_min") !== undefined ||
    c.req.query("char_max") !== undefined
  ) {
    throwHttpError(
      "BAD_REQUEST",
      "Character count filter is not supported in workers mode",
    )
  }
  if (sort && sort !== "published_at" && sort !== "updated_at") {
    throwHttpError(
      "BAD_REQUEST",
      `Sort by ${sort} is not supported in workers mode`,
    )
  }
  if (order && order !== "asc" && order !== "desc") {
    throwHttpError("BAD_REQUEST", `Invalid order: ${order}. Use "asc" or "desc"`)
  }

  // Build filter params
  const params: FilterParams = {}
  const title = c.req.query("title")
  const author = c.req.query("author")
  const person_id = c.req.query("person_id")
  const ndc = c.req.query("ndc")
  const orthography = c.req.query("orthography")
  const published_after = c.req.query("published_after")
  const published_before = c.req.query("published_before")
  const copyright = c.req.query("copyright")

  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (published_after && !datePattern.test(published_after)) {
    throwHttpError("BAD_REQUEST", "published_after must be in YYYY-MM-DD format")
  }
  if (published_before && !datePattern.test(published_before)) {
    throwHttpError("BAD_REQUEST", "published_before must be in YYYY-MM-DD format")
  }
  if (copyright && copyright !== "true" && copyright !== "false") {
    throwHttpError("BAD_REQUEST", `Invalid copyright value: ${copyright}. Use "true" or "false"`)
  }

  if (title) params.title = title
  if (author) params.author = author
  if (person_id) params.person_id = person_id
  if (ndc) params.ndc = ndc
  if (orthography) params.orthography = orthography
  if (published_after) params.published_after = published_after
  if (published_before) params.published_before = published_before
  if (copyright) params.copyright = copyright

  const allWorks = await getWorks(c.env)
  const filtered = filterWorks(allWorks, params)
  const sorted = sortWorks(filtered, sort, order)
  const result = paginate(sorted, page, perPage)

  return c.json(result)
})

// T013: GET /works/:id (work detail)
works.get("/works/:id", async (c) => {
  const id = c.req.param("id")
  const allWorks = await getWorks(c.env)
  const work = allWorks.find((w) => w.id === id)

  if (!work) {
    throwHttpError("NOT_FOUND", "Work not found")
  }

  return c.json(work)
})

// T012: GET /works/:id/content (work content)
works.get("/works/:id/content", async (c) => {
  const id = c.req.param("id")
  const format = (c.req.query("format") ?? "plain") as string

  // Format validation
  if (format === "structured") {
    throwHttpError(
      "NOT_SUPPORTED",
      "Structured format is not available in workers mode",
    )
  }
  if (format !== "plain" && format !== "raw" && format !== "html") {
    throwHttpError("BAD_REQUEST", `Invalid format: ${format}`)
  }

  const allWorks = await getWorks(c.env)
  const work = allWorks.find((w) => w.id === id)

  if (!work) {
    throwHttpError("NOT_FOUND", "Work not found")
  }

  // Copyright check
  if (work.copyrightFlag) {
    throwHttpError(
      "FORBIDDEN",
      "Content of copyrighted works is not available",
    )
  }

  // Source URL check
  if (!work.sourceUrls.text) {
    throwHttpError("NOT_FOUND", "Content source not available for this work")
  }

  const { text, cacheHit } = await getContent(id, work.sourceUrls.text, c.env)
  const content = formatContent(text, format as ContentFormat)

  c.header("X-Cache-Status", cacheHit ? "HIT" : "MISS")

  return c.json({
    workId: id,
    format,
    content,
  })
})

export { works }
