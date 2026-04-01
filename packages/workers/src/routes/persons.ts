import { Hono } from "hono"
import type { Env } from "../env"
import { throwHttpError } from "../errors"
import { parsePagination } from "../lib/pagination"
import { getMetadata, getPersons } from "../services/metadata"
import { paginate } from "../services/filter"

const persons = new Hono<{ Bindings: Env }>()

// T014: GET /persons — persons list with pagination
persons.get("/persons", async (c) => {
  const { page, perPage } = parsePagination(c)

  const allPersons = await getPersons(c.env.KV)
  const result = paginate(allPersons, page, perPage)

  return c.json(result)
})

// T015: GET /persons/:id — person detail
persons.get("/persons/:id", async (c) => {
  const id = c.req.param("id")
  const allPersons = await getPersons(c.env.KV)
  const person = allPersons.find((p) => p.id === id)

  if (!person) {
    throwHttpError("NOT_FOUND", "Person not found")
  }

  return c.json(person)
})

// T016: GET /persons/:id/works — works by person
persons.get("/persons/:id/works", async (c) => {
  const id = c.req.param("id")
  const { works: allWorks, persons: allPersons } = await getMetadata(c.env.KV)
  const person = allPersons.find((p) => p.id === id)

  if (!person) {
    throwHttpError("NOT_FOUND", "Person not found")
  }

  const personWorks = allWorks.filter((w) =>
    w.authors.some((a) => a.id === id),
  )

  return c.json({
    total: personWorks.length,
    page: 1,
    perPage: personWorks.length,
    items: personWorks,
  })
})

export { persons }
