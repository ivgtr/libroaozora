import { afterEach, expect, it, vi } from "vitest"
import { CSV_URL, downloadMetadata } from "../../scripts/download-metadata"

afterEach(() => vi.restoreAllMocks())
it("downloads the official CSV ZIP once without storage operations", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1, 2])))
  expect(await downloadMetadata()).toEqual(new Uint8Array([1, 2]))
  expect(CSV_URL).toBe("https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip")
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(CSV_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }))
})
it("rejects an unsuccessful download without retry", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }))
  await expect(downloadMetadata()).rejects.toThrow("CSV fetch failed: 404")
  expect(fetchMock).toHaveBeenCalledOnce()
})
