import { expect, it } from "vitest"
import { sourceRevision, sourceDate, sourceCount } from "../src/revision"
import type { Work } from "../src/types/index"
const base = { sourceUrls: { card: "", text: "https://www.aozora.gr.jp/789.zip?a=1" }, textSource: { updatedAt: "2018-02-05", revisionCount: 15 } } as Work
it("has deterministic revisions including complete URL and text-only updates", async () => {
  const revision = await sourceRevision(base)
  expect(revision).toMatch(/^[0-9a-f]{64}$/)
  expect(await sourceRevision({ ...base })).toBe(revision)
  for (const work of [
    { ...base, textSource: { ...base.textSource!, updatedAt: "2018-02-06" } },
    { ...base, textSource: { ...base.textSource!, revisionCount: 16 } },
    { ...base, sourceUrls: { ...base.sourceUrls, text: base.sourceUrls.text + "2" } },
    { ...base, sourceUrls: { ...base.sourceUrls, text: base.sourceUrls.text!.replace("www.", "") } },
  ]) expect(await sourceRevision(work)).not.toBe(revision)
  expect(await sourceRevision({ ...base, updatedAt: "2099-01-01" })).toBe(revision)
})
it("keeps missing data null and rejects malformed source fields", () => {
  expect(sourceDate(" ")).toBeNull()
  expect(sourceCount(undefined)).toBeNull()
  expect(sourceDate("2013-08-08")).toBe("2013-08-08")
  expect(sourceCount("0")).toBe(0)
  expect(() => sourceDate("2026-02-30")).toThrow()
  expect(sourceCount("-1")).toBe(-1)
  expect(() => sourceCount("-2")).toThrow()
  expect(() => sourceCount("1.5")).toThrow()
})
