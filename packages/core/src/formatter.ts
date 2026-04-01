import type { ContentFormat } from "./types/index.js"

export function formatContent(text: string, format: ContentFormat): string {
  switch (format) {
    case "raw":
      return text
    case "plain":
      return toPlain(text)
    case "html":
      return toHtml(text)
    case "structured":
      throw new Error("Structured format is not implemented")
  }
}

// --- Header / Footer ---

const SEPARATOR_RE = /^[-─━―]{5,}$/

function removeHeader(text: string): string {
  const lines = text.split("\n")
  let separatorCount = 0
  let cutIndex = -1

  for (let i = 0; i < lines.length; i++) {
    if (SEPARATOR_RE.test(lines[i].trim())) {
      separatorCount++
      if (separatorCount === 2) {
        // セパレーター直後の空行を探す（最大3行まで。本文中の空行を拾わない）
        const searchLimit = Math.min(i + 4, lines.length)
        for (let j = i + 1; j < searchLimit; j++) {
          if (lines[j].trim() === "") {
            cutIndex = j + 1
            break
          }
        }
        if (cutIndex === -1) {
          cutIndex = i + 1
        }
        break
      }
    }
  }

  if (cutIndex === -1) return text
  return lines.slice(cutIndex).join("\n")
}

function removeFooter(text: string): string {
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith("底本：")) {
      return lines.slice(0, i).join("\n")
    }
  }
  return text
}

// --- Gaiji ---

function convertGaijiUnicode(text: string): string {
  return text.replace(
    /※［＃[^］]*U\+([0-9A-Fa-f]+)[^］]*］/g,
    (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)),
  )
}

function removeRemainingGaiji(text: string): string {
  return text.replace(/※［＃[^］]*］/g, "〓")
}

// --- Ruby ---

// ｜ なしの基本ルビ（漢字《ルビ》）の対象文字クラス。
// ひらがな・カタカナは含めない。青空文庫の慣例では仮名へのルビは ｜ を前置し、
// removeRangeRuby / convertRangeRubyHtml で処理される。
const CJK_CHAR = "[\\u3400-\\u9FFF\\uF900-\\uFAFF々〇]"
const CJK_RUN = `${CJK_CHAR}+`

function removeRangeRuby(text: string): string {
  return text.replace(/｜([^《]+)《[^》]+》/g, "$1")
}

function removeBasicRuby(text: string): string {
  return text.replace(new RegExp(`(${CJK_RUN})《[^》]+》`, "g"), "$1")
}

function convertRangeRubyHtml(text: string): string {
  return text.replace(
    /｜([^《]+)《([^》]+)》/g,
    "<ruby>$1<rp>（</rp><rt>$2</rt><rp>）</rp></ruby>",
  )
}

function convertBasicRubyHtml(text: string): string {
  return text.replace(
    new RegExp(`(${CJK_RUN})《([^》]+)》`, "g"),
    "<ruby>$1<rp>（</rp><rt>$2</rt><rp>）</rp></ruby>",
  )
}

// --- Front-reference annotations ---
// 形式: テキスト［＃「テキスト」はXXX］
// 注記内の「」に囲まれた文字列と、その直前に出現する同一文字列を合わせて置換する。
// 正規表現バックリファレンスではなく、注記をまず検出し、直前のテキストと文字列比較する。

function replaceFrontRef(
  text: string,
  annotationRe: RegExp,
  replacer: (quoted: string, ...groups: string[]) => string,
): string {
  annotationRe.lastIndex = 0
  const matches: Array<{ index: number; length: number; quoted: string; groups: string[] }> = []
  let m
  while ((m = annotationRe.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length, quoted: m[1], groups: m.slice(2) })
  }

  let result = text
  // 後方から処理してインデックスを保持
  for (let i = matches.length - 1; i >= 0; i--) {
    const { index, length, quoted, groups } = matches[i]
    const beforeStart = index - quoted.length
    if (beforeStart >= 0 && result.substring(beforeStart, index) === quoted) {
      const replacement = replacer(quoted, ...groups)
      result = result.substring(0, beforeStart) + replacement + result.substring(index + length)
    }
  }
  return result
}

// --- Annotations ---

function removeAnnotations(text: string): string {
  return text.replace(/［＃[^］]*］/g, "")
}

// block annotations: ［＃ここからXXX］...［＃ここでXXX終わり］
function removeBlockAnnotations(text: string): string {
  return text
    .replace(/［＃ここから[^］]*］/g, "")
    .replace(/［＃ここで[^］]*終わり］/g, "")
}

// --- Clean up ---

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n")
}

// --- HTML-specific ---

const HEADING_MAP: Record<string, { tag: string; className: string }> = {
  "大見出し": { tag: "h3", className: "o-midashi" },
  "中見出し": { tag: "h4", className: "naka-midashi" },
  "小見出し": { tag: "h5", className: "ko-midashi" },
}

function processHeadings(text: string): string {
  return replaceFrontRef(
    text,
    /［＃「([^」]+)」は(大見出し|中見出し|小見出し)］/g,
    (content, level) => {
      const h = HEADING_MAP[level]
      return h ? `<${h.tag} class="${h.className}">${content}</${h.tag}>` : content
    },
  )
}

function processEmphasis(text: string): string {
  return replaceFrontRef(
    text,
    /［＃「([^」]+)」に傍点］/g,
    (content) => `<em class="sesame_dot">${content}</em>`,
  )
}

function processBold(text: string): string {
  return replaceFrontRef(
    text,
    /［＃「([^」]+)」は太字］/g,
    (content) => `<span class="futoji">${content}</span>`,
  )
}

function processBlockAnnotationsHtml(text: string): string {
  return text.replace(
    /［＃ここから太字］([\s\S]*?)［＃ここで太字終わり］/g,
    '<span class="futoji">$1</span>',
  )
}

// --- Pipelines ---

// toPlain / toHtml は同じ前処理パイプラインを共有する:
//   1. removeHeader → removeFooter → convertGaijiUnicode → removeRemainingGaiji
// その後、フォーマット固有の変換を行い、最後に共通の後処理:
//   removeAnnotations → collapseBlankLines → trim

function toPlain(text: string): string {
  let result = text
  // 共通前処理
  result = removeHeader(result)
  result = removeFooter(result)
  result = convertGaijiUnicode(result)
  result = removeRemainingGaiji(result)
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

function toHtml(text: string): string {
  let result = text
  // 共通前処理
  result = removeHeader(result)
  result = removeFooter(result)
  result = convertGaijiUnicode(result)
  result = removeRemainingGaiji(result)
  // html 固有: ルビを HTML タグに変換（範囲ルビを先に処理）
  result = convertRangeRubyHtml(result)
  result = convertBasicRubyHtml(result)
  // 前方参照型注記を HTML タグに変換
  result = processHeadings(result)
  result = processEmphasis(result)
  result = processBold(result)
  // ブロック太字を HTML タグに変換してから、残りの注記を一括除去
  result = processBlockAnnotationsHtml(result)
  result = removeBlockAnnotations(result)
  result = removeAnnotations(result)
  // 共通後処理
  result = collapseBlankLines(result)
  return result.trim()
}
