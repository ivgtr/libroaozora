import { describe, it, expect } from "vitest"
import { parseCSV } from "../src/csv-parser.js"

// 55-column CSV header for list_person_all_extended_utf8.csv
const HEADER = [
  "作品ID",           // 0
  "作品名",           // 1
  "作品名読み",       // 2
  "ソート用読み",     // 3
  "副題",             // 4
  "副題読み",         // 5
  "原題",             // 6
  "初出",             // 7
  "分類番号",         // 8
  "文字遣い種別",     // 9
  "作品著作権フラグ", // 10
  "公開日",           // 11
  "最終更新日",       // 12
  "図書カードURL",    // 13
  "人物ID",           // 14
  "姓",               // 15
  "名",               // 16
  "姓読み",           // 17
  "名読み",           // 18
  "姓読みソート用",   // 19
  "名読みソート用",   // 20
  "姓ローマ字",       // 21
  "名ローマ字",       // 22
  "役割フラグ",       // 23
  "生年月日",         // 24
  "没年月日",         // 25
  "人物著作権フラグ", // 26
  "底本名1",          // 27
  "底本出版社名1",    // 28
  "底本初版発行年1",  // 29
  "入力に使用した版1",// 30
  "校正に使用した版1",// 31
  "底本の親本名1",    // 32
  "底本の親本出版社名1", // 33
  "底本の親本初版発行年1", // 34
  "底本名2",          // 35
  "底本出版社名2",    // 36
  "底本初版発行年2",  // 37
  "入力に使用した版2",// 38
  "校正に使用した版2",// 39
  "底本の親本名2",    // 40
  "底本の親本出版社名2", // 41
  "底本の親本初版発行年2", // 42
  "入力者",           // 43
  "校正者",           // 44
  "テキストファイルURL",       // 45
  "テキストファイル最終更新日", // 46
  "テキストファイル符号化方式", // 47
  "テキストファイル文字集合",   // 48
  "テキストファイル修正回数",   // 49
  "XHTML/HTMLファイルURL",     // 50
  "XHTML/HTMLファイル最終更新日", // 51
  "XHTML/HTMLファイル符号化方式", // 52
  "XHTML/HTMLファイル文字集合",   // 53
  "XHTML/HTMLファイル修正回数",   // 54
].join(",")

/**
 * Create a CSV row with 55 columns from a partial column map.
 * Unspecified columns default to empty strings.
 */
function makeRow(fields: Record<number, string>): string {
  const cols = Array.from({ length: 55 }, (_, i) => fields[i] ?? "")
  return cols.map(v => v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v).join(",")
}

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n")
}

describe("parseCSV", () => {
  it("T009-1: single work, single author", () => {
    const input = csv(
      makeRow({
        0: "1",        // 作品ID
        1: "走れメロス", // 作品名
        2: "はしれめろす", // 作品名読み
        8: "NDC 913",  // 分類番号
        9: "新字新仮名", // 文字遣い種別
        10: "なし",    // 作品著作権フラグ
        11: "2006-07-01", // 公開日
        12: "2010-01-01", // 最終更新日
        13: "https://www.aozora.gr.jp/cards/000035/card1567.html", // 図書カードURL
        14: "35",      // 人物ID
        15: "太宰",    // 姓
        16: "治",      // 名
        17: "だざい",  // 姓読み
        18: "おさむ",  // 名読み
        21: "Dazai",   // 姓ローマ字
        22: "Osamu",   // 名ローマ字
        23: "著者",    // 役割フラグ
        24: "1909-06-19", // 生年月日
        25: "1948-06-13", // 没年月日
        26: "なし",    // 人物著作権フラグ
        45: "https://www.aozora.gr.jp/cards/000035/files/1567_ruby_5948.zip", // テキストファイルURL
        50: "https://www.aozora.gr.jp/cards/000035/files/1567_14913.html",    // XHTML/HTMLファイルURL
      })
    )

    const result = parseCSV(input)

    expect(result.works).toHaveLength(1)
    expect(result.persons).toHaveLength(1)

    const work = result.works[0]
    expect(work.id).toBe("1")
    expect(work.title).toBe("走れメロス")
    expect(work.titleReading).toBe("はしれめろす")
    expect(work.ndc).toBe("913")
    expect(work.orthography).toBe("新字新仮名")
    expect(work.copyrightFlag).toBe(false)
    expect(work.publishedAt).toBe("2006-07-01")
    expect(work.updatedAt).toBe("2010-01-01")
    expect(work.authors).toHaveLength(1)
    expect(work.authors[0]).toEqual({
      id: "35",
      role: "author",
      lastName: "太宰",
      firstName: "治",
      lastNameReading: "だざい",
      firstNameReading: "おさむ",
    })

    const person = result.persons[0]
    expect(person.id).toBe("35")
    expect(person.lastName).toBe("太宰")
    expect(person.firstName).toBe("治")
    expect(person.lastNameReading).toBe("だざい")
    expect(person.firstNameReading).toBe("おさむ")
    expect(person.lastNameRomaji).toBe("Dazai")
    expect(person.firstNameRomaji).toBe("Osamu")
    expect(person.birthDate).toBe("1909-06-19")
    expect(person.deathDate).toBe("1948-06-13")
    expect(person.copyrightFlag).toBe(false)
    expect(person.worksCount).toBe(1)
    expect(person.siteUrl).toBe("https://www.aozora.gr.jp/index_pages/person35.html")
  })

  it("T009-2: multiple authors — same work with 著者 and 翻訳者", () => {
    const input = csv(
      makeRow({
        0: "100",
        1: "ハムレット",
        2: "はむれっと",
        10: "なし",
        11: "2000-01-01",
        12: "2005-01-01",
        13: "https://www.aozora.gr.jp/cards/000100/card100.html",
        14: "200",
        15: "シェイクスピア",
        16: "",
        17: "しぇいくすぴあ",
        18: "",
        23: "著者",
        26: "なし",
      }),
      makeRow({
        0: "100",
        1: "ハムレット",
        2: "はむれっと",
        10: "なし",
        11: "2000-01-01",
        12: "2005-01-01",
        13: "https://www.aozora.gr.jp/cards/000100/card100.html",
        14: "300",
        15: "坪内",
        16: "逍遥",
        17: "つぼうち",
        18: "しょうよう",
        23: "翻訳者",
        26: "なし",
      })
    )

    const result = parseCSV(input)

    expect(result.works).toHaveLength(1)
    expect(result.works[0].authors).toHaveLength(2)

    const roles = result.works[0].authors.map(a => a.role)
    expect(roles).toContain("author")
    expect(roles).toContain("translator")

    expect(result.persons).toHaveLength(2)
  })

  it("T009-3: person deduplication + worksCount", () => {
    const input = csv(
      makeRow({
        0: "1",
        1: "作品A",
        2: "さくひんえー",
        10: "なし",
        11: "2000-01-01",
        12: "2000-01-01",
        13: "https://example.com/card1.html",
        14: "50",
        15: "宮沢",
        16: "賢治",
        17: "みやざわ",
        18: "けんじ",
        23: "著者",
        26: "なし",
      }),
      makeRow({
        0: "2",
        1: "作品B",
        2: "さくひんびー",
        10: "なし",
        11: "2001-01-01",
        12: "2001-01-01",
        13: "https://example.com/card2.html",
        14: "50",
        15: "宮沢",
        16: "賢治",
        17: "みやざわ",
        18: "けんじ",
        23: "著者",
        26: "なし",
      })
    )

    const result = parseCSV(input)

    expect(result.works).toHaveLength(2)
    expect(result.persons).toHaveLength(1)
    expect(result.persons[0].worksCount).toBe(2)
  })

  it("T009-4: copyright flag conversion", () => {
    const input = csv(
      makeRow({
        0: "10",
        1: "著作権あり作品",
        2: "ちょさくけんありさくひん",
        10: "あり",
        11: "2020-01-01",
        12: "2020-01-01",
        13: "https://example.com/card10.html",
        14: "60",
        15: "現代",
        16: "作家",
        17: "げんだい",
        18: "さっか",
        23: "著者",
        26: "あり",
      })
    )

    const result = parseCSV(input)

    expect(result.works[0].copyrightFlag).toBe(true)
    expect(result.persons[0].copyrightFlag).toBe(true)
  })

  it("T009-5: date conversion — publishedAt as ISO 8601 passthrough", () => {
    const input = csv(
      makeRow({
        0: "20",
        1: "テスト作品",
        2: "てすとさくひん",
        10: "なし",
        11: "2006-07-01",
        12: "2010-12-31",
        13: "https://example.com/card20.html",
        14: "70",
        15: "テスト",
        16: "著者",
        17: "てすと",
        18: "ちょしゃ",
        23: "著者",
        26: "なし",
      })
    )

    const result = parseCSV(input)

    expect(result.works[0].publishedAt).toBe("2006-07-01")
    expect(result.works[0].updatedAt).toBe("2010-12-31")
  })

  it("T009-6: NDC prefix removal", () => {
    const testCases: [string, string][] = [
      ["NDC 913", "913"],
      ["NDC K913", "K913"],
      ["NDC 712 914", "712 914"],
    ]

    for (const [ndcInput, expected] of testCases) {
      const input = csv(
        makeRow({
          0: `ndc-${ndcInput}`,
          1: "NDCテスト",
          2: "えぬでぃーしーてすと",
          8: ndcInput,
          10: "なし",
          11: "2000-01-01",
          12: "2000-01-01",
          13: "https://example.com/card.html",
          14: "80",
          15: "テスト",
          16: "著者",
          17: "てすと",
          18: "ちょしゃ",
          23: "著者",
          26: "なし",
        })
      )

      const result = parseCSV(input)
      expect(result.works[0].ndc).toBe(expected)
    }
  })

  it("T009-7: sourceUrls mapping", () => {
    const input = csv(
      makeRow({
        0: "30",
        1: "URL作品",
        2: "ゆーあーるえるさくひん",
        10: "なし",
        11: "2000-01-01",
        12: "2000-01-01",
        13: "https://www.aozora.gr.jp/cards/000035/card1567.html",
        14: "90",
        15: "テスト",
        16: "著者",
        17: "てすと",
        18: "ちょしゃ",
        23: "著者",
        26: "なし",
        45: "https://www.aozora.gr.jp/cards/000035/files/1567_ruby.zip",
        50: "https://www.aozora.gr.jp/cards/000035/files/1567_14913.html",
      })
    )

    const result = parseCSV(input)

    expect(result.works[0].sourceUrls).toEqual({
      card: "https://www.aozora.gr.jp/cards/000035/card1567.html",
      text: "https://www.aozora.gr.jp/cards/000035/files/1567_ruby.zip",
      html: "https://www.aozora.gr.jp/cards/000035/files/1567_14913.html",
    })
  })

  it("T009-8: siteUrl construction from person ID", () => {
    const input = csv(
      makeRow({
        0: "40",
        1: "サイトURL作品",
        2: "さいとゆーあーるえるさくひん",
        10: "なし",
        11: "2000-01-01",
        12: "2000-01-01",
        13: "https://example.com/card.html",
        14: "123",
        15: "テスト",
        16: "著者",
        17: "てすと",
        18: "ちょしゃ",
        23: "著者",
        26: "なし",
      })
    )

    const result = parseCSV(input)

    expect(result.persons[0].siteUrl).toBe(
      "https://www.aozora.gr.jp/index_pages/person123.html"
    )
  })

  it("T009-9: empty optional fields → undefined", () => {
    const input = csv(
      makeRow({
        0: "50",
        1: "オプショナル作品",
        2: "おぷしょなるさくひん",
        // 4: 副題 — empty
        // 5: 副題読み — empty
        // 6: 原題 — empty
        // 8: 分類番号 — empty
        // 9: 文字遣い種別 — empty
        10: "なし",
        11: "2000-01-01",
        12: "2000-01-01",
        13: "https://example.com/card.html",
        14: "100",
        15: "テスト",
        16: "著者",
        17: "てすと",
        18: "ちょしゃ",
        23: "著者",
        // 21, 22: ローマ字 — empty
        // 24, 25: 生年月日, 没年月日 — empty
        26: "なし",
      })
    )

    const result = parseCSV(input)

    const work = result.works[0]
    expect(work.subtitle).toBeUndefined()
    expect(work.subtitleReading).toBeUndefined()
    expect(work.originalTitle).toBeUndefined()
    expect(work.ndc).toBeUndefined()
    expect(work.orthography).toBeUndefined()

    const person = result.persons[0]
    expect(person.lastNameRomaji).toBeUndefined()
    expect(person.firstNameRomaji).toBeUndefined()
    expect(person.birthDate).toBeUndefined()
    expect(person.deathDate).toBeUndefined()
  })

  it("T009-10: unknown role flag — person tracked but not in authors", () => {
    const input = csv(
      makeRow({
        0: "60",
        1: "未知ロール作品",
        2: "みちろーるさくひん",
        10: "なし",
        11: "2000-01-01",
        12: "2000-01-01",
        13: "https://example.com/card.html",
        14: "110",
        15: "テスト",
        16: "著者",
        17: "てすと",
        18: "ちょしゃ",
        23: "監修者",
        26: "なし",
      })
    )

    const result = parseCSV(input)

    expect(result.works).toHaveLength(1)
    expect(result.works[0].authors).toHaveLength(0)
    expect(result.persons).toHaveLength(1)
    expect(result.persons[0].id).toBe("110")
  })

  it("T009-11: header row excluded", () => {
    // parseCSV uses d3-dsv which treats first row as header
    const input = csv(
      makeRow({
        0: "70",
        1: "ヘッダーテスト",
        2: "へっだーてすと",
        10: "なし",
        11: "2000-01-01",
        12: "2000-01-01",
        13: "https://example.com/card.html",
        14: "120",
        15: "テスト",
        16: "著者",
        17: "てすと",
        18: "ちょしゃ",
        23: "著者",
        26: "なし",
      })
    )

    const result = parseCSV(input)

    // Should have exactly 1 work, not 2 (header is not data)
    expect(result.works).toHaveLength(1)
    expect(result.works[0].id).toBe("70")
  })

  it("T009-12: person birthDate/deathDate stored as-is", () => {
    const input = csv(
      makeRow({
        0: "80",
        1: "日付テスト",
        2: "ひづけてすと",
        10: "なし",
        11: "2000-01-01",
        12: "2000-01-01",
        13: "https://example.com/card.html",
        14: "130",
        15: "テスト",
        16: "著者",
        17: "てすと",
        18: "ちょしゃ",
        23: "著者",
        24: "1909-06-19",
        25: "不詳",
        26: "なし",
      })
    )

    const result = parseCSV(input)

    expect(result.persons[0].birthDate).toBe("1909-06-19")
    expect(result.persons[0].deathDate).toBe("不詳")
  })

  it("T009-4b: empty copyright flag treated as false", () => {
    const input = csv(
      makeRow({
        0: "95",
        1: "空フラグ作品",
        2: "からふらぐさくひん",
        10: "",  // 空の作品著作権フラグ
        11: "2020-01-01",
        12: "2020-01-01",
        13: "https://example.com/card.html",
        14: "145",
        15: "テスト",
        16: "著者",
        17: "てすと",
        18: "ちょしゃ",
        23: "著者",
        26: "",  // 空の人物著作権フラグ
      })
    )

    const result = parseCSV(input)

    expect(result.works[0].copyrightFlag).toBe(false)
    expect(result.persons[0].copyrightFlag).toBe(false)
  })

  it("T009-7 supplement: sourceUrls with missing text/html URLs", () => {
    const input = csv(
      makeRow({
        0: "90",
        1: "URLなし作品",
        2: "ゆーあーるえるなしさくひん",
        10: "なし",
        11: "2000-01-01",
        12: "2000-01-01",
        13: "https://example.com/card.html",
        14: "140",
        15: "テスト",
        16: "著者",
        17: "てすと",
        18: "ちょしゃ",
        23: "著者",
        26: "なし",
        // 45, 50: テキスト/HTML URL — empty
      })
    )

    const result = parseCSV(input)

    expect(result.works[0].sourceUrls).toEqual({
      card: "https://example.com/card.html",
    })
    expect(result.works[0].sourceUrls.text).toBeUndefined()
    expect(result.works[0].sourceUrls.html).toBeUndefined()
  })

  it("T009-7b: sourceUrls.card is empty string when 図書カードURL is missing", () => {
    const input = csv(
      makeRow({
        0: "91",
        1: "カードURLなし",
        2: "かーどゆーあーるえるなし",
        10: "なし",
        11: "2000-01-01",
        12: "2000-01-01",
        // 13: 図書カードURL — empty
        14: "141",
        15: "テスト",
        16: "著者",
        17: "てすと",
        18: "ちょしゃ",
        23: "著者",
        26: "なし",
      })
    )

    const result = parseCSV(input)

    expect(result.works[0].sourceUrls.card).toBe("")
  })

  it("T009-13: rows with empty 作品ID are skipped", () => {
    const input = csv(
      makeRow({
        0: "",  // 空の作品ID
        1: "無効な作品",
        2: "むこうなさくひん",
        10: "なし",
        11: "2000-01-01",
        12: "2000-01-01",
        13: "https://example.com/card.html",
        14: "200",
        15: "テスト",
        16: "著者",
        17: "てすと",
        18: "ちょしゃ",
        23: "著者",
        26: "なし",
      }),
      makeRow({
        0: "100",
        1: "有効な作品",
        2: "ゆうこうなさくひん",
        10: "なし",
        11: "2000-01-01",
        12: "2000-01-01",
        13: "https://example.com/card2.html",
        14: "201",
        15: "テスト",
        16: "著者2",
        17: "てすと",
        18: "ちょしゃに",
        23: "著者",
        26: "なし",
      })
    )

    const result = parseCSV(input)

    expect(result.works).toHaveLength(1)
    expect(result.works[0].id).toBe("100")
  })
})
