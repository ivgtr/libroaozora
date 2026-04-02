import { Hono } from "hono"
import type { Env } from "../env"
import { throwHttpError } from "../errors"
import { parsePagination } from "../lib/pagination"
import { getMetadata, getPersons } from "../services/metadata"
import {
  filterPersons,
  sortPersons,
  paginate,
} from "../services/filter"
import type { PersonFilterParams } from "../services/filter"

const persons = new Hono<{ Bindings: Env }>()

// GET /persons — persons list with filtering, sorting, pagination
persons.get("/persons", async (c) => {
  const { page, perPage } = parsePagination(c)
  const sort = c.req.query("sort")
  const order = c.req.query("order")

  if (sort && sort !== "name") {
    throwHttpError(
      "BAD_REQUEST",
      `Sort by ${sort} is not supported. Use "name"`,
    )
  }
  if (order && order !== "asc" && order !== "desc") {
    throwHttpError("BAD_REQUEST", `Invalid order: ${order}. Use "asc" or "desc"`)
  }

  const params: PersonFilterParams = {}
  const name = c.req.query("name")
  if (name) params.name = name

  const allPersons = await getPersons(c.env)
  const filtered = filterPersons(allPersons, params)
  const sorted = sortPersons(filtered, sort, order)
  const result = paginate(sorted, page, perPage)

  return c.json(result)
})

// T015: GET /persons/:id — person detail
persons.get("/persons/:id", async (c) => {
  const id = c.req.param("id")
  const allPersons = await getPersons(c.env)
  const person = allPersons.find((p) => p.id === id)

  if (!person) {
    throwHttpError("NOT_FOUND", "Person not found")
  }

  return c.json(person)
})

// T016: GET /persons/:id/works — works by person
persons.get("/persons/:id/works", async (c) => {
  const id = c.req.param("id")
  const { page, perPage } = parsePagination(c)
  const { works: allWorks, persons: allPersons } = await getMetadata(c.env)
  const person = allPersons.find((p) => p.id === id)

  if (!person) {
    throwHttpError("NOT_FOUND", "Person not found")
  }

  const personWorks = allWorks.filter((w) =>
    w.authors.some((a) => a.id === id),
  )

  return c.json(paginate(personWorks, page, perPage))
})

export { persons }
