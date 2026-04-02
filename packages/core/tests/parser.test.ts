import { describe, it, expect } from "vitest"
import { parseStructured } from "../src/parser.js"

describe("parseStructured", () => {
  describe("block splitting", () => {
    it("parses a single paragraph", () => {
      const result = parseStructured("メロスは激怒した。")
      expect(result.blocks).toHaveLength(1)
      expect(result.blocks[0]).toMatchObject({
        type: "paragraph",
        text: "メロスは激怒した。",
      })
    })

    it("parses multiple paragraphs separated by single blank line", () => {
      const result = parseStructured("段落一。\n\n段落二。")
      expect(result.blocks).toHaveLength(2)
      expect(result.blocks[0]).toMatchObject({ type: "paragraph", text: "段落一。" })
      expect(result.blocks[1]).toMatchObject({ type: "paragraph", text: "段落二。" })
    })

    it("inserts separator for multiple consecutive blank lines", () => {
      const result = parseStructured("段落一。\n\n\n段落二。")
      expect(result.blocks).toHaveLength(3)
      expect(result.blocks[0]).toMatchObject({ type: "paragraph" })
      expect(result.blocks[1]).toMatchObject({ type: "separator" })
      expect(result.blocks[2]).toMatchObject({ type: "paragraph" })
    })

    it("treats each non-empty line as a separate paragraph", () => {
      const result = parseStructured("一行目。\n二行目。")
      expect(result.blocks).toHaveLength(2)
      expect(result.blocks[0]).toMatchObject({ type: "paragraph", text: "一行目。" })
      expect(result.blocks[1]).toMatchObject({ type: "paragraph", text: "二行目。" })
    })
  })

  describe("headings", () => {
    it("parses 大見出し as level 1", () => {
      const result = parseStructured("羅生門［＃「羅生門」は大見出し］")
      expect(result.blocks).toHaveLength(1)
      expect(result.blocks[0]).toMatchObject({ type: "heading", level: 1, text: "羅生門" })
    })

    it("parses 中見出し as level 2", () => {
      const result = parseStructured("第一章［＃「第一章」は中見出し］")
      expect(result.blocks[0]).toMatchObject({ type: "heading", level: 2, text: "第一章" })
    })

    it("parses 小見出し as level 3", () => {
      const result = parseStructured("その一［＃「その一」は小見出し］")
      expect(result.blocks[0]).toMatchObject({ type: "heading", level: 3, text: "その一" })
    })
  })

  describe("ruby", () => {
    it("parses basic ruby (CJK characters)", () => {
      const result = parseStructured("邪智暴虐《じゃちぼうぎゃく》")
      const nodes = (result.blocks[0] as { nodes: unknown[] }).nodes
      expect(nodes).toEqual([
        { type: "ruby", base: "邪智暴虐", reading: "じゃちぼうぎゃく" },
      ])
    })

    it("parses range ruby", () => {
      const result = parseStructured("｜ロンドン警視庁《スコットランドヤード》")
      const nodes = (result.blocks[0] as { nodes: unknown[] }).nodes
      expect(nodes).toEqual([
        { type: "ruby", base: "ロンドン警視庁", reading: "スコットランドヤード" },
      ])
    })

    it("parses ruby mixed with plain text", () => {
      const result = parseStructured("その邪智暴虐《じゃちぼうぎゃく》を許さぬ")
      const nodes = (result.blocks[0] as { nodes: unknown[] }).nodes
      expect(nodes).toEqual([
        { type: "text", text: "その" },
        { type: "ruby", base: "邪智暴虐", reading: "じゃちぼうぎゃく" },
        { type: "text", text: "を許さぬ" },
      ])
    })
  })

  describe("emphasis", () => {
    it("parses 傍点 annotation", () => {
      const result = parseStructured("重要なこと［＃「重要なこと」に傍点］")
      const nodes = (result.blocks[0] as { nodes: unknown[] }).nodes
      expect(nodes).toEqual([
        { type: "emphasis", text: "重要なこと" },
      ])
    })

    it("parses emphasis with surrounding text", () => {
      const result = parseStructured("これは重要なこと［＃「重要なこと」に傍点］です")
      const nodes = (result.blocks[0] as { nodes: unknown[] }).nodes
      expect(nodes).toEqual([
        { type: "text", text: "これは" },
        { type: "emphasis", text: "重要なこと" },
        { type: "text", text: "です" },
      ])
    })
  })

  describe("bold", () => {
    it("parses inline bold annotation", () => {
      const result = parseStructured("大事な文章［＃「大事な文章」は太字］")
      const nodes = (result.blocks[0] as { nodes: unknown[] }).nodes
      expect(nodes).toEqual([
        { type: "bold", text: "大事な文章" },
      ])
    })

    it("parses block bold annotation", () => {
      const result = parseStructured("［＃ここから太字］太字テキスト［＃ここで太字終わり］")
      const nodes = (result.blocks[0] as { nodes: unknown[] }).nodes
      expect(nodes).toEqual([
        { type: "bold", text: "太字テキスト" },
      ])
    })
  })

  describe("mixed inline nodes", () => {
    it("parses ruby and emphasis together", () => {
      const result = parseStructured("邪智暴虐《じゃちぼうぎゃく》を重要なこと［＃「重要なこと」に傍点］とす")
      const nodes = (result.blocks[0] as { nodes: unknown[] }).nodes
      expect(nodes).toEqual([
        { type: "ruby", base: "邪智暴虐", reading: "じゃちぼうぎゃく" },
        { type: "text", text: "を" },
        { type: "emphasis", text: "重要なこと" },
        { type: "text", text: "とす" },
      ])
    })
  })

  describe("preprocess integration", () => {
    it("removes header and footer", () => {
      const input = [
        "作品名",
        "著者名",
        "-------------------------------------------------------",
        "【テキスト中に現れる記号について】",
        "-------------------------------------------------------",
        "",
        "　メロスは激怒した。",
        "",
        "底本：「全集」出版社",
      ].join("\n")
      const result = parseStructured(input)
      expect(result.blocks).toHaveLength(1)
      expect(result.blocks[0]).toMatchObject({ type: "paragraph", text: "　メロスは激怒した。" })
    })

    it("converts gaiji with Unicode codepoint", () => {
      const result = parseStructured("※［＃「漢字」、U+9DD7、ページ-行数］")
      const nodes = (result.blocks[0] as { nodes: unknown[] }).nodes
      expect(nodes).toEqual([
        { type: "text", text: String.fromCodePoint(0x9dd7) },
      ])
    })

    it("removes unknown annotations", () => {
      const result = parseStructured("テスト［＃字下げ終わり］")
      const nodes = (result.blocks[0] as { nodes: unknown[] }).nodes
      expect(nodes).toEqual([
        { type: "text", text: "テスト" },
      ])
    })
  })

  describe("paragraph text field", () => {
    it("contains plain text from nodes", () => {
      const result = parseStructured("邪智暴虐《じゃちぼうぎゃく》のテスト")
      const block = result.blocks[0] as { type: string; text: string }
      expect(block.text).toBe("邪智暴虐のテスト")
    })
  })
})
