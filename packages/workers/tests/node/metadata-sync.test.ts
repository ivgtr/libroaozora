import { expect, it, vi } from "vitest"
import { publishSnapshot, validateCSV } from "../../scripts/metadata-sync"
import type { MetadataStore } from "../../scripts/metadata-sync"
import type { Snapshot } from "../../src/services/metadata-model"
import { CURRENT_KEY, snapshotKey } from "../../src/services/metadata-model"
import { SEED_WORKS, SEED_PERSONS, SEED_SYNCED_AT } from "../fixtures/seed"
const snapshot = (generation: string, syncedAt = "2026-09-06T01:00:00Z"): Snapshot => ({ schemaVersion: 1, generation, works: SEED_WORKS, persons: SEED_PERSONS, syncedAt })
function storage() {
  const values = new Map<string, string>()
  const store: MetadataStore = { readR2: vi.fn(async key => values.get(key) ?? null), writeR2: vi.fn(async (key, value) => { values.set(key, value) }), writeKV: vi.fn(async () => {}) }
  return { store, values }
}
it("importing the CLI does not fetch or publish", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch")
  await import("../../scripts/sync-metadata")
  expect(fetchMock).not.toHaveBeenCalled()
  fetchMock.mockRestore()
})
it("publishes immutable data before its pointer, retains a legacy previous and survives KV failure", async () => {
  const { store, values } = storage()
  values.set("metadata/all.json", JSON.stringify({ works: SEED_WORKS, persons: SEED_PERSONS, syncedAt: SEED_SYNCED_AT }))
  vi.mocked(store.writeKV).mockRejectedValue(new Error("KV down"))
  const pointer = await publishSnapshot(store, snapshot("new"))
  expect(pointer.previous?.generation).toMatch(/^legacy-/)
  expect(values.has(snapshotKey("new"))).toBe(true)
  expect(JSON.parse(values.get(CURRENT_KEY)!)).toEqual(pointer)
  expect(await publishSnapshot(store, snapshot("new"))).toEqual(pointer)
})
it.each(["snapshot", "pointer"])("preserves the published pointer when %s writing fails", async phase => {
  const { store, values } = storage()
  await publishSnapshot(store, snapshot("old"))
  const before = values.get(CURRENT_KEY)
  vi.mocked(store.writeR2).mockImplementation(async (key, text) => {
    if (key === (phase === "pointer" ? CURRENT_KEY : snapshotKey("new"))) throw new Error("write failed")
    values.set(key, text)
  })
  await expect(publishSnapshot(store, snapshot("new", "2026-09-06T02:00:00Z"))).rejects.toThrow()
  expect(values.get(CURRENT_KEY)).toBe(before)
})
it("recognizes a successful pointer write whose response was lost and rejects time reversal", async () => {
  const { store, values } = storage()
  vi.mocked(store.writeR2).mockImplementation(async (key, text) => {
    values.set(key, text)
    if (key === CURRENT_KEY) throw new Error("lost acknowledgement")
  })
  expect((await publishSnapshot(store, snapshot("new"))).current.generation).toBe("new")
  await expect(publishSnapshot(store, snapshot("old", "2026-09-05T00:00:00Z"))).rejects.toThrow("reverse")
})
const header = "作品ID,作品名,人物ID,作品著作権フラグ,人物著作権フラグ,図書カードURL,テキストファイルURL,テキストファイル最終更新日,テキストファイル修正回数,役割フラグ,姓,名"
const row = "047927,作品,000001,なし,なし,https://www.aozora.gr.jp/card.html,https://www.aozora.gr.jp/a.zip,2013-08-08,0,著者,姓,名"
it("accepts real source fields and multiple authors while rejecting malformed input", () => {
  const csv = header + "\n" + row
  expect(validateCSV(csv).works[0].textSource).toEqual({ updatedAt: "2013-08-08", revisionCount: 0 })
  expect(validateCSV(csv + "\n" + row.replace("000001", "000002")).works[0].authors).toHaveLength(2)
  for (const bad of ["", header, csv.replace("なし,なし", ",なし"), csv + ',extra', header + '\n"unclosed', csv + "\n" + row.replace("2013-08-08", "2013-08-09")]) expect(() => validateCSV(bad)).toThrow()
})
