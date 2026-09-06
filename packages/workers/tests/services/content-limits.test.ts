import { expect, it, vi } from "vitest"
import { readBounded, within } from "../../src/services/content-limits"

it.each([9, 10, 11])("counts streamed bytes against limit %s", async limit => {
  const cancel = vi.fn()
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(5)); controller.enqueue(new Uint8Array(5)); }, cancel })
  if (limit < 10) {
    await expect(readBounded(stream, limit)).rejects.toThrow("limit")
    expect(cancel).toHaveBeenCalledOnce()
  } else {
    // finite stream for the successful boundary cases
    const response = new Response(new Uint8Array(10), { headers: { "Content-Length": "1" } })
    expect((await readBounded(response.body, limit)).length).toBe(10)
    await stream.cancel()
  }
})
it("interrupts a stalled stream on abort", async () => {
  const cancel = vi.fn()
  const controller = new AbortController()
  const result = readBounded(new ReadableStream({ cancel }), 10, controller.signal)
  controller.abort()
  await expect(result).rejects.toThrow()
  expect(cancel).toHaveBeenCalledOnce()
})
it("bounds stalled binding operations and observes late rejection", async () => {
  vi.useFakeTimers()
  try {
    const result = within(() => new Promise(() => {}), 100)
    const assertion = expect(result).rejects.toThrow("deadline")
    await vi.advanceTimersByTimeAsync(100)
    await assertion
  } finally { vi.useRealTimers() }
})
