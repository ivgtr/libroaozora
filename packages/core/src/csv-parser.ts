import { csvParse } from "d3-dsv"
import type {
  ParseResult,
  Work,
  Person,
  PersonRef,
  Role,
  SourceUrls,
} from "./types/index.js"

const ROLE_MAP: Record<string, Role> = {
  著者: "author",
  翻訳者: "translator",
  編者: "editor",
  校訂者: "reviser",
}

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value == null) return undefined
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

function parseNdc(raw: string | undefined): string | undefined {
  const v = emptyToUndefined(raw)
  if (v == null) return undefined
  if (v.startsWith("NDC ")) {
    const rest = v.slice(4).trim()
    return rest === "" ? undefined : rest
  }
  return v
}

function parseCopyrightFlag(raw: string | undefined): boolean {
  const v = raw?.trim()
  if (!v) return false // 空文字・undefined → 著作権なし（安全側に倒す）
  return v !== "なし"
}

function buildSourceUrls(row: Record<string, string>): SourceUrls {
  // card は必須フィールド（型: string）。実 CSV では常に存在するが、欠損時は空文字。
  // text / html はオプショナル（型: string | undefined）。空文字は undefined に変換。
  const urls: SourceUrls = {
    card: row["図書カードURL"]?.trim() ?? "",
  }
  const text = emptyToUndefined(row["テキストファイルURL"])
  if (text != null) urls.text = text
  const html = emptyToUndefined(row["XHTML/HTMLファイルURL"])
  if (html != null) urls.html = html
  return urls
}

export function parseCSV(csv: string): ParseResult {
  const rows = csvParse(csv)

  const workMap = new Map<
    string,
    { work: Omit<Work, "authors">; authors: PersonRef[] }
  >()
  const personMap = new Map<string, Person>()
  const personWorksSet = new Map<string, Set<string>>()

  for (const row of rows) {
    const workId = row["作品ID"]?.trim() ?? ""
    const personId = row["人物ID"]?.trim() ?? ""

    if (!workId) continue // 必須フィールド欠損行をスキップ

    // Build or update work
    if (!workMap.has(workId)) {
      workMap.set(workId, {
        work: {
          id: workId,
          title: row["作品名"] ?? "",
          titleReading: row["作品名読み"] ?? "",
          subtitle: emptyToUndefined(row["副題"]),
          subtitleReading: emptyToUndefined(row["副題読み"]),
          originalTitle: emptyToUndefined(row["原題"]),
          ndc: parseNdc(row["分類番号"]),
          orthography: emptyToUndefined(row["文字遣い種別"]),
          copyrightFlag: parseCopyrightFlag(row["作品著作権フラグ"]),
          publishedAt: row["公開日"]?.trim() ?? "",
          updatedAt: row["最終更新日"]?.trim() ?? "",
          sourceUrls: buildSourceUrls(row as Record<string, string>),
        },
        authors: [],
      })
    }

    // Map role
    const roleFlag = row["役割フラグ"]?.trim() ?? ""
    const role = ROLE_MAP[roleFlag]

    const entry = workMap.get(workId)
    if (role != null && entry) {
      entry.authors.push({
        id: personId,
        role,
        lastName: row["姓"] ?? "",
        firstName: row["名"] ?? "",
        lastNameReading: row["姓読み"] ?? "",
        firstNameReading: row["名読み"] ?? "",
      })
    }

    // Track person (regardless of role)
    if (!personMap.has(personId)) {
      personMap.set(personId, {
        id: personId,
        lastName: row["姓"] ?? "",
        firstName: row["名"] ?? "",
        lastNameReading: row["姓読み"] ?? "",
        firstNameReading: row["名読み"] ?? "",
        lastNameRomaji: emptyToUndefined(row["姓ローマ字"]),
        firstNameRomaji: emptyToUndefined(row["名ローマ字"]),
        birthDate: emptyToUndefined(row["生年月日"]),
        deathDate: emptyToUndefined(row["没年月日"]),
        copyrightFlag: parseCopyrightFlag(row["人物著作権フラグ"]),
        worksCount: 0,
        siteUrl: personId
          ? `https://www.aozora.gr.jp/index_pages/person${personId}.html`
          : undefined,
      })
    }

    // Track works per person for worksCount
    let workIds = personWorksSet.get(personId)
    if (!workIds) {
      workIds = new Set()
      personWorksSet.set(personId, workIds)
    }
    workIds.add(workId)
  }

  // Compute worksCount
  for (const [personId, workIdSet] of personWorksSet) {
    const person = personMap.get(personId)
    if (person) person.worksCount = workIdSet.size
  }

  // Assemble results
  const works: Work[] = Array.from(workMap.values()).map(({ work, authors }) => ({
    ...work,
    authors,
  }))

  const persons: Person[] = Array.from(personMap.values())

  return { works, persons }
}
