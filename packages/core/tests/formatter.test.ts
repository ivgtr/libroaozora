import { describe, it, expect } from "vitest"
import { formatContent } from "../src/formatter.js"

describe("formatContent", () => {
  // 1. raw format
  describe("raw format", () => {
    it("returns input text unchanged", () => {
      const input = "邪智暴虐《じゃちぼうぎゃく》のテスト\n［＃注記］"
      expect(formatContent(input, "raw")).toBe(input)
    })
  })

  // 2-8. plain format
  describe("plain format", () => {
    it("removes basic ruby", () => {
      expect(formatContent("邪智暴虐《じゃちぼうぎゃく》", "plain")).toBe(
        "邪智暴虐",
      )
    })

    it("removes range ruby", () => {
      expect(
        formatContent("｜ロンドン警視庁《スコットランドヤード》", "plain"),
      ).toBe("ロンドン警視庁")
    })

    it("removes inline annotations", () => {
      expect(formatContent("テスト［＃「テスト」に傍点］", "plain")).toBe(
        "テスト",
      )
    })

    it("removes block annotations", () => {
      expect(
        formatContent(
          "［＃ここから太字］テキスト［＃ここで太字終わり］",
          "plain",
        ),
      ).toBe("テキスト")
    })

    it("removes header section", () => {
      const input = [
        "走れメロス",
        "太宰治",
        "-------------------------------------------------------",
        "【テキスト中に現れる記号について】",
        "-------------------------------------------------------",
        "",
        "　メロスは激怒した。",
      ].join("\n")
      const result = formatContent(input, "plain")
      expect(result.trim()).toBe("メロスは激怒した。")
    })

    it("removes header when no blank line after second separator", () => {
      const input = [
        "作品名",
        "著者名",
        "-------------------------------------------------------",
        "記号説明",
        "-------------------------------------------------------",
        "　本文開始。",
      ].join("\n")
      const result = formatContent(input, "plain")
      expect(result.trim()).toBe("本文開始。")
    })

    it("collapses multiple blank lines", () => {
      const input = "段落1\n\n\n\n\n段落2"
      const result = formatContent(input, "plain")
      expect(result).toBe("段落1\n\n段落2")
    })

    it("removes footer with leading whitespace", () => {
      const input = "本文テキスト。\n\n　底本：「全集」出版社"
      const result = formatContent(input, "plain")
      expect(result.trim()).toBe("本文テキスト。")
    })

    it("removes footer section", () => {
      const input = [
        "本文テキスト。",
        "",
        "",
        "",
        "底本：「太宰治全集」筑摩書房",
        "　　　1990年発行",
      ].join("\n")
      const result = formatContent(input, "plain")
      expect(result.trim()).toBe("本文テキスト。")
    })

    it("converts gaiji with Unicode codepoint", () => {
      const input = "※［＃「漢字」、U+9DD7、ページ-行数］"
      const result = formatContent(input, "plain")
      expect(result).toBe(String.fromCodePoint(0x9dd7))
    })
  })

  // structured format throws
  describe("structured format", () => {
    it("throws an error", () => {
      expect(() => formatContent("test", "structured")).toThrow(
        "Structured format is not implemented",
      )
    })
  })
})
