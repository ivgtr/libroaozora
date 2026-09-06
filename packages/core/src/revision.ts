import type { Work } from "./types/index.js"
export const DECODE_VERSION = "aozora-decode-v1"
export async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")
}
export function sourceDate(value: string | undefined): string | null {
  const text = value?.trim()
  if (!text) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text) throw new Error("Invalid text source date")
  return text
}
export function sourceCount(value: string | undefined): number | null {
  const text = value?.trim()
  if (!text) return null
  if (!/^(?:\d+|-1)$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error("Invalid text revision count")
  return Number(text)
}
export function sourceRevision(work: Work): Promise<string> {
  return sha256(JSON.stringify(["aozora-source-v1", work.sourceUrls.text?.trim() ?? null, work.textSource?.updatedAt ?? null, work.textSource?.revisionCount ?? null]))
}
export function contentIdentifier(textHash: string): string { return `${DECODE_VERSION}:${textHash}` }
