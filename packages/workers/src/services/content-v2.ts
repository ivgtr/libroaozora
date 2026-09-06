import { sourceRevision, sha256, DECODE_VERSION, contentIdentifier } from "@libroaozora/core"
import type { Work, Delivery } from "@libroaozora/core"
import type { Env } from "../env"
import type { Metadata } from "./metadata"
import { getPreviousWork } from "./metadata"
import { SourceError, shareContent } from "./content-control"
import { fetchSource, validateText, decodeContentZip } from "./content"
import { limits, readBounded, within } from "./content-limits"

export const contentKVKey = (id: string, revision: string) => `content:v2:${id}:${revision}`
export const contentR2Key = (id: string, revision: string) => `content/v2/${id}/${revision}.zip`
export type ContentEnvelope = {
  schemaVersion: 2
  workId: string
  sourceRevision: string | null
  sourceUrl: string
  fetchedAt: string | null
  zipHash: string | null
  textHash: string
  decodeVersion: string
  contentId: string
  text: string
}
type Found = { entry: ContentEnvelope; cacheHit: boolean; conflict?: boolean; stale?: boolean }
const TTL = 2_592_000
const hashPattern = /^[0-9a-f]{64}$/
async function envelope(work: Work, revision: string | null, text: string, zipHash: string | null, fetchedAt: string | null): Promise<ContentEnvelope> {
  validateText(text)
  const textHash = await sha256(text)
  return { schemaVersion: 2, workId: work.id, sourceRevision: revision, sourceUrl: work.sourceUrls.text!, fetchedAt, zipHash, textHash, decodeVersion: DECODE_VERSION, contentId: contentIdentifier(textHash), text }
}
async function validateEnvelope(value: string, work: Work, revision: string): Promise<ContentEnvelope> {
  const entry = JSON.parse(value) as ContentEnvelope
  if (!entry || entry.schemaVersion !== 2 || entry.workId !== work.id || entry.sourceRevision !== revision || entry.sourceUrl !== work.sourceUrls.text || entry.decodeVersion !== DECODE_VERSION || typeof entry.text !== "string" || !entry.zipHash || !hashPattern.test(entry.zipHash) || !entry.fetchedAt || !Number.isFinite(Date.parse(entry.fetchedAt))) throw new Error("Invalid content envelope")
  validateText(entry.text)
  if (await sha256(entry.text) !== entry.textHash || entry.contentId !== contentIdentifier(entry.textHash)) throw new Error("Invalid content hash")
  return entry
}
async function readKV(env: Env, work: Work, revision: string): Promise<ContentEnvelope | undefined> {
  try {
    const text = await within(() => env.KV.get(contentKVKey(work.id, revision)), 1500)
    return text === null ? undefined : await validateEnvelope(text, work, revision)
  } catch (error) { console.error("Content cache failed", { workId: work.id, revision, stage: "v2-kv-read", error }); return undefined }
}
async function readR2(env: Env, work: Work, revision: string): Promise<{ entry?: ContentEnvelope; etag?: string }> {
  let etag: string | undefined
  let stage = "v2-r2-get"
  try {
    const object = await within(() => env.R2.get(contentR2Key(work.id, revision)), 1500)
    if (!object) return {}
    stage = "v2-r2-body"
    const bytes = await readBounded(object.body, limits(env).zipBytes, AbortSignal.timeout(1500))
    etag = object.etag
    stage = "v2-zip-validation"
    const text = decodeContentZip(bytes, limits(env).outputBytes)
    const meta = object.customMetadata
    if (!meta || meta.sourceRevision !== revision || meta.sourceUrl !== work.sourceUrls.text || meta.decodeVersion !== DECODE_VERSION || !Number.isFinite(Date.parse(meta.fetchedAt))) throw new Error("Invalid ZIP metadata")
    const entry = await envelope(work, revision, text, await sha256(bytes), meta.fetchedAt)
    if (entry.zipHash !== meta.zipHash || entry.textHash !== meta.textHash) throw new Error("Invalid saved ZIP hash")
    return { entry, etag }
  } catch (error) { console.error("Content cache failed", { workId: work.id, revision, stage, error }); return { etag } }
}
async function saveKV(env: Env, entry: ContentEnvelope) {
  try {
    await within(() => env.KV.put(contentKVKey(entry.workId, entry.sourceRevision!), JSON.stringify(entry), { expirationTtl: TTL }), 1500)
    console.info("Content storage saved", { workId: entry.workId, revision: entry.sourceRevision, stage: "v2-kv-write" })
  } catch (error) { console.error("Content cache failed", { workId: entry.workId, stage: "v2-kv-write", error }) }
}
async function currentContent(env: Env, work: Work, revision: string, deadline: number): Promise<Found> {
  const cached = await readKV(env, work, revision)
  if (cached) return { entry: cached, cacheHit: true }
  const stored = await readR2(env, work, revision)
  if (stored.entry) { await saveKV(env, stored.entry); return { entry: stored.entry, cacheHit: true } }
  const key = JSON.stringify([work.id, revision])
  const { data, text } = await fetchSource(work.id, work.sourceUrls.text!, env, key, deadline)
  const entry = await envelope(work, revision, text, await sha256(data), new Date().toISOString())
  let result: Found = { entry, cacheHit: false }
  let mayWriteKV = true
  try {
    const put = await within(() => env.R2.put(contentR2Key(work.id, revision), data, {
      onlyIf: stored.etag ? { etagMatches: stored.etag } : { etagDoesNotMatch: "*" },
      customMetadata: { sourceUrl: entry.sourceUrl, sourceRevision: revision, fetchedAt: entry.fetchedAt!, zipHash: entry.zipHash!, textHash: entry.textHash, decodeVersion: DECODE_VERSION },
    }), 1500)
    if (put === null) {
      const winner = await readR2(env, work, revision)
      if (!winner.entry) { mayWriteKV = false; result.conflict = true }
      else {
        const conflict = winner.entry.zipHash !== entry.zipHash || winner.entry.textHash !== entry.textHash
        result = { entry: winner.entry, cacheHit: false, conflict }
        if (conflict) {
          mayWriteKV = false
          console.error("Content revision conflict", { workId: work.id, revision, observedZipHash: entry.zipHash, storedZipHash: winner.entry.zipHash, observedTextHash: entry.textHash, storedTextHash: winner.entry.textHash })
        }
      }
    } else console.info("Content storage saved", { workId: work.id, revision, stage: "v2-r2-write" })
  } catch (error) {
    console.error("Content cache failed", { workId: work.id, revision, stage: "v2-r2-write", error })
  }
  if (mayWriteKV) await saveKV(env, result.entry)
  return result
}
async function staleContent(env: Env, work: Work, metadata: Metadata): Promise<Found | undefined> {
  const previous = await getPreviousWork(env, metadata, work.id)
  if (previous?.sourceUrls.text && !previous.copyrightFlag) {
    const revision = await sourceRevision(previous)
    const entry = await readKV(env, previous, revision) ?? (await readR2(env, previous, revision)).entry
    if (entry) return { entry, stale: true, cacheHit: true }
  }
  const urls = [...new Set([work.sourceUrls.text, previous?.sourceUrls.text].filter((url): url is string => Boolean(url)))]
  for (const url of urls) {
    try {
      const object = await within(() => env.R2.get(new URL(url).pathname.slice(1)), 1000)
      if (!object) continue
      const bytes = await readBounded(object.body, limits(env).zipBytes, AbortSignal.timeout(1000))
      const text = decodeContentZip(bytes, limits(env).outputBytes)
      const entry = await envelope({ ...work, sourceUrls: { ...work.sourceUrls, text: url } }, null, text, await sha256(bytes), null)
      return { entry, stale: true, cacheHit: true }
    } catch (error) { console.warn("Legacy ZIP unavailable", { workId: work.id, error }) }
  }
  try {
    const text = await within(() => env.KV.get(`content:${work.id}`), 1000)
    if (text !== null) return { entry: await envelope(work, null, text, null, null), stale: true, cacheHit: true }
  } catch (error) { console.warn("Legacy text unavailable", { workId: work.id, error }) }
}
export async function getVersionedContent(env: Env, work: Work, metadata: Metadata): Promise<{ text: string; cacheHit: boolean; delivery: Delivery }> {
  const deadline = Date.now() + limits(env).totalMs
  const revision = await sourceRevision(work)
  // Share version acquisition, then construct delivery from each caller's own snapshot.
  let found: Found
  try {
    found = await within(async () => await shareContent(env, JSON.stringify([work.id, revision]), () => currentContent(env, work, revision, deadline)), deadline - Date.now())
  } catch (error) {
    if (!(error instanceof SourceError) || error.kind !== "temporary") throw error
    // Candidate sets depend on the caller's previous reference, not just the current work.
    // Use the same limiter as current acquisition, with a separate shared promise.
    const staleKey = JSON.stringify(["stale", work.id, revision, metadata.previous?.generation ?? null, metadata.previous?.digest ?? null])
    const old = await within(async () => await shareContent(env, staleKey, () => staleContent(env, work, metadata)), deadline - Date.now()).catch(() => undefined)
    if (!old) throw error
    found = old
  }
  const verification = found.stale ? "stale" : metadata.state !== "current" || found.conflict ? "unverified" : "current"
  console.info("Content delivered", { workId: work.id, revision: found.entry.sourceRevision, verification, cacheHit: found.cacheHit })
  return { text: found.entry.text, cacheHit: found.cacheHit, delivery: {
    metadataGeneration: metadata.generation, metadataSyncedAt: metadata.syncedAt, metadataState: metadata.state,
    sourceRevision: found.entry.sourceRevision, expectedSourceRevision: revision, contentId: found.entry.contentId,
    verification, validatedAt: verification === "current" ? metadata.validatedAt : null,
  } }
}
