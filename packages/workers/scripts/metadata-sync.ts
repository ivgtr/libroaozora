import { csvParse, parseCSV, sourceDate, sourceCount, sha256 } from "@libroaozora/core"
import { CURRENT_KEY, snapshotKey, metadataKey, parsePointer, parseSnapshot, validateData } from "../src/services/metadata-model"
import type { Snapshot, Pointer, Reference } from "../src/services/metadata-model"
import { METADATA_R2_KEY, METADATA_TTL } from "../src/lib/constants"

export interface MetadataStore {
  readR2(key: string): Promise<string | null>
  writeR2(key: string, value: string): Promise<void>
  writeKV(key: string, value: string, ttl: number): Promise<void>
}
export function validateCSV(csv: string) {
  const rows = csvParse(csv.replace(/^\uFEFF/, ""), true)
  const required = ["作品ID", "作品名", "人物ID", "作品著作権フラグ", "人物著作権フラグ", "図書カードURL", "テキストファイルURL", "テキストファイル最終更新日", "テキストファイル修正回数", "役割フラグ"]
  if (!rows.length || required.some(key => !(key in rows[0]))) throw new Error("Missing CSV rows or required headers")
  const works = new Map<string, string>(), persons = new Map<string, string>()
  for (const row of rows) {
    if (!/^\d+$/.test(row["作品ID"]) || !/^\d+$/.test(row["人物ID"]) || !row["作品名"].trim()) throw new Error("Invalid CSV identity")
    if (!["あり", "なし"].includes(row["作品著作権フラグ"]) || !["あり", "なし"].includes(row["人物著作権フラグ"])) throw new Error("Invalid CSV copyright")
    if (!["著者", "翻訳者", "編者", "校訂者", "その他"].includes(row["役割フラグ"])) throw new Error("Invalid CSV role")
    for (const column of ["図書カードURL", "テキストファイルURL"]) {
      const url = row[column].trim()
      if (url && !["http:", "https:"].includes(new URL(url).protocol)) throw new Error("Invalid CSV URL protocol")
      if ((column === "図書カードURL" && !url) || (url && !/^https?:\/\//.test(url))) throw new Error("Invalid CSV URL")
    }
    const value = JSON.stringify([["作品名", "作品名読み", "副題", "副題読み", "原題", "分類番号", "文字遣い種別", "作品著作権フラグ", "公開日", "最終更新日", "図書カードURL", "テキストファイルURL", "XHTML/HTMLファイルURL"].map(key => row[key]?.trim() ?? ""), sourceDate(row["テキストファイル最終更新日"]), sourceCount(row["テキストファイル修正回数"])])
    if (works.has(row["作品ID"]) && works.get(row["作品ID"]) !== value) throw new Error("Conflicting work rows")
    works.set(row["作品ID"], value)
    const person = JSON.stringify(["姓", "名", "姓読み", "名読み", "姓ローマ字", "名ローマ字", "生年月日", "没年月日", "人物著作権フラグ"].map(key => row[key] ?? ""))
    if (persons.has(row["人物ID"]) && persons.get(row["人物ID"]) !== person) throw new Error("Conflicting person rows")
    persons.set(row["人物ID"], person)
  }
  const data = parseCSV(csv.replace(/^\uFEFF/, ""))
  for (const work of data.works) {
    if (!work.authors.length || work.authors.some(author => !persons.has(author.id))) throw new Error("Invalid person reference")
  }
  return data
}

export async function publishSnapshot(store: MetadataStore, snapshot: Snapshot): Promise<Pointer> {
  validateData(snapshot)
  const beforeText = await store.readR2(CURRENT_KEY)
  const before = beforeText === null ? null : parsePointer(beforeText)
  const text = JSON.stringify(snapshot)
  const reference = { generation: snapshot.generation, digest: await sha256(text) }
  await parseSnapshot(text, reference)
  let previous: Reference | null = before?.current ?? null
  if (before) {
    const oldText = await store.readR2(snapshotKey(before.current.generation))
    if (oldText === null) throw new Error("Current snapshot unavailable")
    const old = await parseSnapshot(oldText, before.current)
    if (old.generation === snapshot.generation) {
      if (before.current.digest !== reference.digest) throw new Error("Conflicting repeated generation")
      return before
    }
    if (Date.parse(old.syncedAt) >= Date.parse(snapshot.syncedAt)) throw new Error("Metadata publication would reverse time")
    console.info("Metadata change", { previousWorks: old.works.length, works: snapshot.works.length, previousPersons: old.persons.length, persons: snapshot.persons.length })
  } else {
    const legacyText = await store.readR2(METADATA_R2_KEY)
    if (legacyText !== null) {
      const legacy = JSON.parse(legacyText)
      validateData(legacy)
      const legacySnapshot = { ...legacy, schemaVersion: 1 as const, generation: `legacy-${(await sha256(legacyText)).slice(0, 32)}` }
      const text = JSON.stringify(legacySnapshot)
      previous = { generation: legacySnapshot.generation, digest: await sha256(text) }
      await saveImmutable(store, previous, text)
    }
  }
  await saveImmutable(store, reference, text)
  try { await store.writeKV(metadataKey(snapshot.generation), text, METADATA_TTL) }
  catch (error) { console.error("Metadata KV publication failed", { generation: snapshot.generation, error }) }
  // The workflow serializes publishers; reject a changed pointer rather than overwriting it.
  if (await store.readR2(CURRENT_KEY) !== beforeText) throw new Error("Metadata pointer changed during publication")
  const pointer: Pointer = { schemaVersion: 1, current: reference, previous }
  const pointerText = JSON.stringify(pointer)
  try { await store.writeR2(CURRENT_KEY, pointerText) }
  catch (error) {
    if (await store.readR2(CURRENT_KEY) !== pointerText) throw error
  }
  if (await store.readR2(CURRENT_KEY) !== pointerText) throw new Error("Metadata pointer verification failed")
  console.info("Metadata published", { generation: snapshot.generation, syncedAt: snapshot.syncedAt, works: snapshot.works.length, persons: snapshot.persons.length, bytes: new TextEncoder().encode(text).length })
  return pointer
}
async function saveImmutable(store: MetadataStore, reference: Reference, text: string) {
  const key = snapshotKey(reference.generation)
  const existing = await store.readR2(key)
  if (existing !== null && existing !== text) throw new Error("Immutable metadata collision")
  if (existing === null) await store.writeR2(key, text)
  const stored = await store.readR2(key)
  if (stored === null) throw new Error("Missing published snapshot")
  await parseSnapshot(stored, reference)
}
