// --- Header / Footer ---

const SEPARATOR_RE = /^[-─━―]{5,}$/

export function removeHeader(text: string): string {
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

export function removeFooter(text: string): string {
  const lines = text.split("\n")
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith("底本：")) {
      return lines.slice(0, i).join("\n")
    }
  }
  return text
}

// --- Gaiji ---

export function convertGaijiUnicode(text: string): string {
  return text.replace(
    /※［＃[^］]*U\+([0-9A-Fa-f]+)[^］]*］/g,
    (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)),
  )
}

export function removeRemainingGaiji(text: string): string {
  return text.replace(/※［＃[^］]*］/g, "〓")
}

// --- Clean up ---

export function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n")
}

// --- Preprocess pipeline ---

export function preprocess(text: string): string {
  let result = text
  result = removeHeader(result)
  result = removeFooter(result)
  result = convertGaijiUnicode(result)
  result = removeRemainingGaiji(result)
  return result
}

// --- Annotations ---

export function removeAnnotations(text: string): string {
  return text.replace(/［＃[^］]*］/g, "")
}

export function removeBlockAnnotations(text: string): string {
  return text
    .replace(/［＃ここから[^］]*］/g, "")
    .replace(/［＃ここで[^］]*終わり］/g, "")
}

// --- Front-reference annotations ---
// 形式: テキスト［＃「テキスト」はXXX］
// 注記内の「」に囲まれた文字列と、その直前に出現する同一文字列を合わせて置換する。
// 正規表現バックリファレンスではなく、注記をまず検出し、直前のテキストと文字列比較する。

export function replaceFrontRef(
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

// --- Ruby patterns ---

export const CJK_CHAR = "[\\u3400-\\u9FFF\\uF900-\\uFAFF々〇]"
export const CJK_RUN = `${CJK_CHAR}+`
