import type { StructuredContent, ContentBlock, InlineNode } from "./types/index.js"
import {
  preprocess,
  replaceFrontRef,
  CJK_RUN,
} from "./preprocess.js"

// --- Markers for front-reference annotations ---

const MARK = {
  EMPHASIS_START: "\x01",
  EMPHASIS_END: "\x02",
  BOLD_START: "\x03",
  BOLD_END: "\x04",
}

// --- Heading detection ---

const HEADING_ANNOTATION_RE = /［＃「([^」]+)」は(大見出し|中見出し|小見出し)］/

const HEADING_LEVEL_MAP: Record<string, number> = {
  "大見出し": 1,
  "中見出し": 2,
  "小見出し": 3,
}

function isHeadingLine(line: string): boolean {
  return HEADING_ANNOTATION_RE.test(line)
}

function parseHeading(line: string): ContentBlock {
  const m = HEADING_ANNOTATION_RE.exec(line)
  if (!m) {
    return { type: "paragraph", text: line, nodes: [{ type: "text", text: line }] }
  }
  const text = m[1]
  const level = HEADING_LEVEL_MAP[m[2]] ?? 3
  return { type: "heading", level, text }
}

// --- Inline node parsing ---

function resolveEmphasis(text: string): string {
  return replaceFrontRef(
    text,
    /［＃「([^」]+)」に傍点］/g,
    (content) => `${MARK.EMPHASIS_START}${content}${MARK.EMPHASIS_END}`,
  )
}

function resolveBold(text: string): string {
  return replaceFrontRef(
    text,
    /［＃「([^」]+)」は太字］/g,
    (content) => `${MARK.BOLD_START}${content}${MARK.BOLD_END}`,
  )
}

function resolveBlockBold(text: string): string {
  return text.replace(
    /［＃ここから太字］([\s\S]*?)［＃ここで太字終わり］/g,
    `${MARK.BOLD_START}$1${MARK.BOLD_END}`,
  )
}

// Build a combined regex that matches markers, range ruby, basic ruby
const RANGE_RUBY_PATTERN = `｜([^《]+)《([^》]+)》`
const BASIC_RUBY_PATTERN = `(${CJK_RUN})《([^》]+)》`

function buildTokenRegex(): RegExp {
  const escapedMarkers = [
    MARK.EMPHASIS_START,
    MARK.EMPHASIS_END,
    MARK.BOLD_START,
    MARK.BOLD_END,
  ].map((c) => `\\x0${c.charCodeAt(0).toString(16)}`).join("|")

  return new RegExp(
    `${escapedMarkers}|${RANGE_RUBY_PATTERN}|${BASIC_RUBY_PATTERN}`,
    "g",
  )
}

const TOKEN_RE = buildTokenRegex()

function parseInlineNodes(line: string): InlineNode[] {
  // Step 1: Resolve front-reference annotations into markers
  let processed = line
  processed = resolveEmphasis(processed)
  processed = resolveBold(processed)
  processed = resolveBlockBold(processed)

  // Step 2: Remove remaining block and inline annotations
  processed = processed.replace(/［＃ここから[^］]*］/g, "")
  processed = processed.replace(/［＃ここで[^］]*終わり］/g, "")
  processed = processed.replace(/［＃[^］]*］/g, "")

  // Step 3: Tokenize and build InlineNode[]
  const nodes: InlineNode[] = []
  let lastIndex = 0
  let context: "normal" | "emphasis" | "bold" = "normal"

  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(processed)) !== null) {
    const matchStart = m.index
    const matchStr = m[0]

    // Text before this match
    if (matchStart > lastIndex) {
      const textBefore = processed.substring(lastIndex, matchStart)
      if (textBefore) {
        pushTextNode(nodes, textBefore, context)
      }
    }

    if (matchStr === MARK.EMPHASIS_START) {
      context = "emphasis"
      lastIndex = m.index + matchStr.length
    } else if (matchStr === MARK.EMPHASIS_END) {
      context = "normal"
      lastIndex = m.index + matchStr.length
    } else if (matchStr === MARK.BOLD_START) {
      context = "bold"
      lastIndex = m.index + matchStr.length
    } else if (matchStr === MARK.BOLD_END) {
      context = "normal"
      lastIndex = m.index + matchStr.length
    } else {
      // Ruby match — determine which capture groups matched
      // Range ruby: groups 1,2  Basic ruby: groups 3,4
      const base = m[1] ?? m[3]
      const reading = m[2] ?? m[4]
      if (base && reading) {
        nodes.push({ type: "ruby", base, reading })
      }
      lastIndex = m.index + matchStr.length
    }
  }

  // Remaining text after last match
  if (lastIndex < processed.length) {
    const remaining = processed.substring(lastIndex)
    if (remaining) {
      pushTextNode(nodes, remaining, context)
    }
  }

  // If nothing was parsed, return a single text node
  if (nodes.length === 0) {
    return [{ type: "text", text: line }]
  }

  return nodes
}

function pushTextNode(
  nodes: InlineNode[],
  text: string,
  context: "normal" | "emphasis" | "bold",
): void {
  switch (context) {
    case "emphasis":
      nodes.push({ type: "emphasis", text })
      break
    case "bold":
      nodes.push({ type: "bold", text })
      break
    default:
      nodes.push({ type: "text", text })
  }
}

function textFromNodes(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "ruby":
          return n.base
        case "text":
        case "emphasis":
        case "bold":
          return n.text
        case "annotation":
          return n.text
      }
    })
    .join("")
}

// --- Block splitting ---

function splitIntoBlocks(text: string): ContentBlock[] {
  const lines = text.split("\n")
  const blocks: ContentBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === "") {
      // Count consecutive blank lines
      let blankCount = 0
      while (i < lines.length && lines[i].trim() === "") {
        blankCount++
        i++
      }
      if (blankCount >= 2) {
        blocks.push({ type: "separator" })
      }
      // Single blank line: skip (paragraph boundary)
      continue
    }

    if (isHeadingLine(line)) {
      blocks.push(parseHeading(line))
      i++
      continue
    }

    // Non-empty, non-heading line → paragraph
    const nodes = parseInlineNodes(line)
    blocks.push({
      type: "paragraph",
      text: textFromNodes(nodes),
      nodes,
    })
    i++
  }

  return blocks
}

// --- Public API ---

export function parseStructured(text: string): StructuredContent {
  let processed = preprocess(text)
  // trim only ASCII whitespace to preserve full-width space (paragraph indent)
  processed = processed.replace(/^[\n\r\t ]+|[\n\r\t ]+$/g, "")
  const blocks = splitIntoBlocks(processed)
  return { blocks }
}
