import type { Work, Person, SearchResult } from "@libroaozora/core"

export type FilterParams = {
  title?: string
  author?: string
  person_id?: string
  ndc?: string
  orthography?: string
  published_after?: string
  published_before?: string
  copyright?: string
}

export function filterWorks(works: Work[], params: FilterParams): Work[] {
  return works.filter((work) => {
    if (
      params.title &&
      !work.title.toLowerCase().startsWith(params.title.toLowerCase())
    ) {
      return false
    }

    if (params.author) {
      const match = work.authors.some((a) =>
        (a.lastName + a.firstName).includes(params.author!),
      )
      if (!match) return false
    }

    if (params.person_id) {
      const match = work.authors.some((a) => a.id === params.person_id)
      if (!match) return false
    }

    if (params.ndc) {
      if (!work.ndc?.startsWith(params.ndc)) return false
    }

    if (params.orthography) {
      if (work.orthography !== params.orthography) return false
    }

    if (params.published_after) {
      if (work.publishedAt.slice(0, 10) < params.published_after) return false
    }

    if (params.published_before) {
      if (work.publishedAt.slice(0, 10) > params.published_before) return false
    }

    if (params.copyright) {
      if (params.copyright === "true" && !work.copyrightFlag) return false
      if (params.copyright === "false" && work.copyrightFlag) return false
    }

    return true
  })
}

export function sortWorks(
  works: Work[],
  sort?: string,
  order?: string,
): Work[] {
  const sortField = sort === "updated_at" ? "updatedAt" : "publishedAt"
  const direction = order === "asc" ? 1 : -1

  return [...works].sort((a, b) => {
    if (a[sortField] < b[sortField]) return -1 * direction
    if (a[sortField] > b[sortField]) return 1 * direction
    return 0
  })
}

export type PersonFilterParams = {
  name?: string
}

export function filterPersons(
  persons: Person[],
  params: PersonFilterParams,
): Person[] {
  return persons.filter((person) => {
    if (params.name) {
      const query = params.name
      const match =
        person.lastName.includes(query) ||
        person.firstName.includes(query) ||
        person.lastNameReading.includes(query) ||
        person.firstNameReading.includes(query) ||
        (person.lastName + person.firstName).includes(query) ||
        (person.lastNameReading + person.firstNameReading).includes(query)
      if (!match) return false
    }

    return true
  })
}

export function sortPersons(
  persons: Person[],
  sort?: string,
  order?: string,
): Person[] {
  if (!sort) return [...persons]

  const direction = order === "desc" ? -1 : 1

  return [...persons].sort((a, b) => {
    const nameA = a.lastNameReading + a.firstNameReading
    const nameB = b.lastNameReading + b.firstNameReading
    if (nameA < nameB) return -1 * direction
    if (nameA > nameB) return 1 * direction
    return 0
  })
}

export function paginate<T>(
  items: T[],
  page: number,
  perPage: number,
): SearchResult<T> {
  const offset = (page - 1) * perPage
  const slicedItems = items.slice(offset, offset + perPage)

  return {
    total: items.length,
    page,
    perPage,
    items: slicedItems,
  }
}
