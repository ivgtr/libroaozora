// --- Union Types ---

export type Role = "author" | "translator" | "editor" | "reviser"

export type ContentFormat = "plain" | "raw" | "structured"

export type ErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "BAD_REQUEST"
  | "INTERNAL_ERROR"
  | "NOT_SUPPORTED"
  | "SERVICE_UNAVAILABLE"

// --- Entity Types ---

export type SourceUrls = {
  card: string
  text?: string
  html?: string
}

export type PersonRef = {
  id: string
  role: Role
  lastName: string
  firstName: string
  lastNameReading: string
  firstNameReading: string
}

export type Work = {
  id: string
  title: string
  titleReading: string
  subtitle?: string
  subtitleReading?: string
  originalTitle?: string
  authors: PersonRef[]
  ndc?: string
  category?: string
  charCount?: number
  firstSentence?: string
  publishedAt: string
  updatedAt: string
  copyrightFlag: boolean
  orthography?: string
  sourceUrls: SourceUrls
}

export type Person = {
  id: string
  lastName: string
  firstName: string
  lastNameReading: string
  firstNameReading: string
  lastNameRomaji?: string
  firstNameRomaji?: string
  birthDate?: string
  deathDate?: string
  copyrightFlag: boolean
  worksCount: number
  siteUrl?: string
}

// --- Content Types ---

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "ruby"; base: string; reading: string }
  | { type: "emphasis"; text: string }
  | { type: "bold"; text: string }
  | { type: "annotation"; text: string; note: string }

export type ContentBlock =
  | { type: "paragraph"; text: string; nodes: InlineNode[] }
  | { type: "heading"; level: number; text: string }
  | { type: "separator" }

export type StructuredContent = {
  blocks: ContentBlock[]
}

export type WorkContent = {
  workId: string
  format: ContentFormat
  content: string | StructuredContent
}

// --- Search & Error Types ---

export type SearchResult<T> = {
  total: number
  page: number
  perPage: number
  items: T[]
  snippets?: Record<string, string>
}

export type ErrorResponse = {
  error: {
    code: ErrorCode
    message: string
    details?: unknown
  }
}

// --- CSV Parser Result ---

export type ParseResult = {
  works: Work[]
  persons: Person[]
}
