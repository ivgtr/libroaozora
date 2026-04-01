import { describe, it, expect } from "vitest"
import { decode } from "../src/decode.js"

describe("decode", () => {
  it("Basic Shift-JIS decoding", () => {
    // "テスト" in Shift-JIS
    const bytes = new Uint8Array([0x83, 0x65, 0x83, 0x58, 0x83, 0x67])
    expect(decode(bytes)).toBe("テスト")
  })

  it("Japanese special characters (旧字体, katakana, symbols)", () => {
    // "青空文庫" in Shift-JIS
    const aozora = new Uint8Array([0x90, 0xc2, 0x8b, 0xf3, 0x95, 0xb6, 0x8c, 0xc9])
    expect(decode(aozora)).toBe("青空文庫")

    // "走れメロス" in Shift-JIS
    const merosu = new Uint8Array([0x91, 0x96, 0x82, 0xea, 0x83, 0x81, 0x83, 0x8d, 0x83, 0x58])
    expect(decode(merosu)).toBe("走れメロス")
  })

  it("Empty input returns empty string", () => {
    const empty = new Uint8Array([])
    expect(decode(empty)).toBe("")
  })
})
