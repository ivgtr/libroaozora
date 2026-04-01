/**
 * RFC 4180 準拠の CSV パーサー。
 * ヘッダー行をキーとしたオブジェクト配列を返す。
 * ランタイム非依存（new Function / eval 不使用）。
 */
export function csvParse(text: string): Record<string, string>[] {
  const rows = parseRows(text)
  if (rows.length === 0) return []

  const headers = rows[0]
  const result: Record<string, string>[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const obj: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j] ?? ""
    }
    result.push(obj)
  }

  return result
}

function parseRows(text: string): string[][] {
  const rows: string[][] = []
  const len = text.length
  let pos = 0

  while (pos <= len) {
    const { fields, nextPos } = parseRow(text, pos, len)
    rows.push(fields)
    pos = nextPos
    if (pos > len) break
  }

  // 末尾の空行を除去
  if (rows.length > 0) {
    const last = rows[rows.length - 1]
    if (last.length === 1 && last[0] === "") {
      rows.pop()
    }
  }

  return rows
}

function parseRow(
  text: string,
  start: number,
  len: number,
): { fields: string[]; nextPos: number } {
  const fields: string[] = []
  let pos = start

  while (pos <= len) {
    if (pos === len) {
      fields.push("")
      return { fields, nextPos: len + 1 }
    }

    const ch = text[pos]

    if (ch === '"') {
      // Quoted field
      const { value, nextPos } = parseQuotedField(text, pos + 1, len)
      fields.push(value)
      pos = nextPos

      if (pos < len && text[pos] === ",") {
        pos++
        continue
      }
      // End of row (newline or EOF)
      if (pos < len && text[pos] === "\r") pos++
      if (pos < len && text[pos] === "\n") pos++
      return { fields, nextPos: pos }
    }

    // Unquoted field — scan to comma or newline
    const fieldStart = pos
    while (pos < len && text[pos] !== "," && text[pos] !== "\r" && text[pos] !== "\n") {
      pos++
    }
    fields.push(text.slice(fieldStart, pos))

    if (pos < len && text[pos] === ",") {
      pos++
      continue
    }

    // End of row
    if (pos < len && text[pos] === "\r") pos++
    if (pos < len && text[pos] === "\n") pos++
    return { fields, nextPos: pos }
  }

  return { fields, nextPos: pos }
}

function parseQuotedField(
  text: string,
  start: number,
  len: number,
): { value: string; nextPos: number } {
  let pos = start
  let value = ""

  while (pos < len) {
    const ch = text[pos]

    if (ch === '"') {
      if (pos + 1 < len && text[pos + 1] === '"') {
        // Escaped quote ("" → ")
        value += '"'
        pos += 2
      } else {
        // End of quoted field
        return { value, nextPos: pos + 1 }
      }
    } else {
      value += ch
      pos++
    }
  }

  // Unterminated quote — return what we have
  return { value, nextPos: pos }
}
