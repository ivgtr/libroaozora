import type { ContentFormat } from "./types/index.js"
import {
  preprocess,
  collapseBlankLines,
  removeAnnotations,
  removeBlockAnnotations,
  CJK_RUN,
} from "./preprocess.js"

export function formatContent(text: string, format: ContentFormat): string {
  switch (format) {
    case "raw":
      return text
    case "plain":
      return toPlain(text)
    case "structured":
      throw new Error("Structured format is not implemented")
  }
}

// --- Ruby ---

function removeRangeRuby(text: string): string {
  return text.replace(/｜([^《]+)《[^》]+》/g, "$1")
}

function removeBasicRuby(text: string): string {
  return text.replace(new RegExp(`(${CJK_RUN})《[^》]+》`, "g"), "$1")
}

// --- Pipeline ---

function toPlain(text: string): string {
  let result = preprocess(text)
  // plain 固有: ルビ除去（範囲ルビを先に処理。基本ルビは漢字連続のみ対象）
  result = removeRangeRuby(result)
  result = removeBasicRuby(result)
  // ブロック注記を先に除去してから残りの注記を一括除去
  result = removeBlockAnnotations(result)
  result = removeAnnotations(result)
  // 共通後処理
  result = collapseBlankLines(result)
  return result.trim()
}
