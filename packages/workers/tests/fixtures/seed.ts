import type { Work, Person, PersonRef } from "@libroaozora/core"

// --- Person References (for Work.authors) ---

const personRefP1: PersonRef = {
  id: "000001",
  role: "author",
  lastName: "夏目",
  firstName: "漱石",
  lastNameReading: "なつめ",
  firstNameReading: "そうせき",
}

const personRefP2: PersonRef = {
  id: "000002",
  role: "author",
  lastName: "芥川",
  firstName: "龍之介",
  lastNameReading: "あくたがわ",
  firstNameReading: "りゅうのすけ",
}

// --- Works ---

const W1: Work = {
  id: "001000",
  title: "吾輩は猫である",
  titleReading: "わがはいはねこである",
  authors: [personRefP1],
  ndc: "913",
  orthography: "新字新仮名",
  copyrightFlag: false,
  publishedAt: "2000-01-01T00:00:00Z",
  updatedAt: "2020-01-01T00:00:00Z",
  sourceUrls: {
    card: "https://www.aozora.gr.jp/cards/000001/card001000.html",
    text: "https://www.aozora.gr.jp/cards/000001/files/001000_ruby.zip",
  },
}

const W2: Work = {
  id: "002000",
  title: "羅生門",
  titleReading: "らしょうもん",
  authors: [personRefP2],
  ndc: "914",
  orthography: "旧字旧仮名",
  copyrightFlag: false,
  publishedAt: "2005-06-15T00:00:00Z",
  updatedAt: "2022-03-10T00:00:00Z",
  sourceUrls: {
    card: "https://www.aozora.gr.jp/cards/000002/card002000.html",
    text: "https://www.aozora.gr.jp/cards/000002/files/002000_ruby.zip",
  },
}

const W3: Work = {
  id: "003000",
  title: "吾輩は犬である",
  titleReading: "わがはいはいぬである",
  authors: [personRefP1],
  ndc: "913",
  orthography: "新字新仮名",
  copyrightFlag: false,
  publishedAt: "2010-12-25T00:00:00Z",
  updatedAt: "2024-07-01T00:00:00Z",
  sourceUrls: {
    card: "https://www.aozora.gr.jp/cards/000001/card003000.html",
    text: "https://www.aozora.gr.jp/cards/000001/files/003000_ruby.zip",
  },
}

const W4: Work = {
  id: "004000",
  title: "著作権存続作品",
  titleReading: "ちょさくけんそんぞくさくひん",
  authors: [personRefP2],
  copyrightFlag: true,
  publishedAt: "2015-04-01T00:00:00Z",
  updatedAt: "2023-01-01T00:00:00Z",
  sourceUrls: {
    card: "https://www.aozora.gr.jp/cards/000002/card004000.html",
    text: "https://www.aozora.gr.jp/cards/000002/files/004000_ruby.zip",
  },
}

const W5: Work = {
  id: "005000",
  title: "テキストなし作品",
  titleReading: "てきすとなしさくひん",
  authors: [personRefP1],
  copyrightFlag: false,
  publishedAt: "2008-09-01T00:00:00Z",
  updatedAt: "2021-05-20T00:00:00Z",
  sourceUrls: {
    card: "https://www.aozora.gr.jp/cards/000001/card005000.html",
  },
}

// --- Persons ---

const P1: Person = {
  id: "000001",
  lastName: "夏目",
  firstName: "漱石",
  lastNameReading: "なつめ",
  firstNameReading: "そうせき",
  copyrightFlag: false,
  worksCount: 3,
  siteUrl: "https://www.aozora.gr.jp/index_pages/person000001.html",
}

const P2: Person = {
  id: "000002",
  lastName: "芥川",
  firstName: "龍之介",
  lastNameReading: "あくたがわ",
  firstNameReading: "りゅうのすけ",
  copyrightFlag: false,
  worksCount: 2,
  siteUrl: "https://www.aozora.gr.jp/index_pages/person000002.html",
}

const P3: Person = {
  id: "000003",
  lastName: "太宰",
  firstName: "治",
  lastNameReading: "だざい",
  firstNameReading: "おさむ",
  copyrightFlag: false,
  worksCount: 0,
}

// --- Exports ---

export const SEED_WORKS: Work[] = [W1, W2, W3, W4, W5]
export const SEED_PERSONS: Person[] = [P1, P2, P3]
export const SEED_SYNCED_AT = "2026-04-01T00:00:00Z"

/** R2 テスト用ダミー zip データ（テストでは decompress/decode がモックされる） */
export const SEED_CONTENT_ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
export const SEED_METADATA_ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04])
export const METADATA_R2_KEY = "metadata/list_person_all_extended_utf8.zip"

export async function seedKV(kv: KVNamespace): Promise<void> {
  await kv.put("meta:works", JSON.stringify(SEED_WORKS))
  await kv.put("meta:persons", JSON.stringify(SEED_PERSONS))
  await kv.put("meta:syncedAt", SEED_SYNCED_AT)
}

export async function seedR2(r2: R2Bucket): Promise<void> {
  await r2.put("cards/000001/files/001000_ruby.zip", SEED_CONTENT_ZIP)
  await r2.put(METADATA_R2_KEY, SEED_METADATA_ZIP)
}
