# aozora — モノレポ要件書

**バージョン**: v0.1.0  
**作成日**: 2026-03-26  
**ステータス**: Draft

---

## 1. プロジェクト概要

青空文庫のメタデータ検索・本文取得を提供する REST API の OSS 実装。  
単一モノレポで共通基盤（`core`）・Cloudflare Workers 実装（`workers`）・Node.js サーバー実装（`server`）を管理する。

### 1.1 目的

- 青空文庫データをサービスに組み込みやすい形で提供する
- 既存実装（pubserver2・ZORAPI・Aozorasearch）の課題を解消する
  - pubserver2: Heroku 依存で実質死亡・全文検索なし
  - ZORAPI: ソート固定・全文検索なし・個人 Firestore 依存
  - Aozorasearch: Ruby 製・API 非公開・Web UI 専用

### 1.2 スコープ外

- 認証・認可
- 著作権存続作品の本文提供（メタデータのみ返す）
- レート制限（初期バージョン）
- npm 公開
- MCP サーバー対応（将来の拡張候補）

---

## 2. リポジトリ構成

```
aozora/                          # モノレポルート
├── packages/
│   ├── core/                    # Phase 1: 共通基盤
│   ├── workers/                 # Phase 2: Cloudflare Workers 実装
│   └── server/                  # TODO: Node.js + Docker 実装
├── pnpm-workspace.yaml
├── package.json                 # ルートスクリプト・共通 devDependencies
└── README.md
```

### 2.1 パッケージ依存関係

```
workers ──▶ core
server  ──▶ core   （TODO）
```

`core` は他パッケージに依存しない。依存は常に一方向。

### 2.2 pnpm workspace 設定

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
```

```jsonc
// packages/workers/package.json（抜粋）
{
  "dependencies": {
    "@aozora/core": "workspace:*"
  }
}
```

---

## 3. API インターフェース（workers・server 共通）

両実装は **URL・レスポンス形式・エラー形式を完全に同一** とする。  
クライアントはどちらを向いているか意識しなくてよい。

### 3.1 エンドポイント一覧

| エンドポイント | workers | server |
|---|---|---|
| `GET /v1/works` | ✅（`q` 全文検索は 501） | ✅ |
| `GET /v1/works/:id` | ✅ | ✅ |
| `GET /v1/works/:id/content` | ✅ | ✅ |
| `GET /v1/persons` | ✅ | ✅ |
| `GET /v1/persons/:id` | ✅ | ✅ |
| `GET /v1/persons/:id/works` | ✅ | ✅ |
| `GET /v1/ndcs` | ❌ 初期未対応 | ✅ |
| `GET /v1/health` | ✅ | ✅ |
| `GET /v1/stats` | ✅ | ✅ |

### 3.2 クエリパラメータ（`GET /v1/works`）

| パラメータ | 型 | workers | server | 説明 |
|---|---|---|---|---|
| `q` | string | 501 | ✅ | 全文検索キーワード |
| `title` | string | ✅ | ✅ | 作品名（前方一致） |
| `author` | string | ✅ | ✅ | 著者名（部分一致） |
| `person_id` | string | ✅ | ✅ | 著者 ID |
| `ndc` | string | ✅ | ✅ | NDC 分類（前方一致） |
| `orthography` | string | ✅ | ✅ | 仮名遣い |
| `char_min` / `char_max` | number | ✅ | ✅ | 文字数範囲 |
| `published_after` / `published_before` | string | ✅ | ✅ | 公開日範囲 |
| `copyright` | boolean | ✅ | ✅ | 著作権存続フィルタ（デフォルト: false） |
| `sort` | string | ✅（`access_count` 除く） | ✅ | `published_at` \| `updated_at` \| `char_count` \| `access_count` |
| `order` | `asc\|desc` | ✅ | ✅ | デフォルト: desc |
| `page` / `per_page` | number | ✅ | ✅ | デフォルト: 1 / 20、最大: 100 |

### 3.3 本文フォーマット（`GET /v1/works/:id/content`）

| `format` | workers | server | 内容 |
|---|---|---|---|
| `plain` | ✅ | ✅ | 青空文庫記法除去・ルビ除去 |
| `raw` | ✅ | ✅ | 青空文庫記法そのまま |
| `html` | ✅ | ✅ | `<ruby>` タグ展開済み HTML |
| `structured` | ❌ 初期未対応 | ✅ | 段落・ルビ・注記を保持した JSON 構造 |

### 3.4 非対応時のレスポンス（workers 固有）

```
GET /v1/works?q=...
→ 501 Not Implemented
  { "error": { "code": "NOT_SUPPORTED", "message": "Full-text search is not available. Use aozora-server for FTS." } }
```

```
GET /v1/works/:id/content
→ キャッシュ MISS 時: X-Cache-Status: MISS ヘッダーを付与
→ キャッシュ HIT 時:  X-Cache-Status: HIT
```

---

## 4. データ型定義（core で管理）

### 4.1 作品（Work）

```typescript
type Work = {
  id: string
  title: string
  titleReading: string
  subtitle?: string
  subtitleReading?: string
  originalTitle?: string
  authors: PersonRef[]
  ndc?: string
  category?: string
  charCount?: number
  firstSentence?: string
  publishedAt: string        // ISO 8601
  updatedAt: string          // ISO 8601
  copyrightFlag: boolean
  orthography?: string       // "新字新仮名" | "旧字旧仮名" 等
  sourceUrls: {
    card: string
    text?: string
    html?: string
  }
}

type PersonRef = {
  id: string
  role: "author" | "translator" | "editor"
  lastName: string
  firstName: string
  lastNameReading: string
  firstNameReading: string
}
```

### 4.2 人物（Person）

```typescript
type Person = {
  id: string
  lastName: string
  firstName: string
  lastNameReading: string
  firstNameReading: string
  lastNameRomaji?: string
  firstNameRomaji?: string
  birthDate?: string
  deathDate?: string
  copyrightFlag: boolean
  worksCount: number
  siteUrl?: string
}
```

### 4.3 本文コンテンツ（WorkContent）

```typescript
type WorkContent = {
  workId: string
  format: ContentFormat
  content: string | StructuredContent
}

type ContentFormat = "plain" | "structured" | "html" | "raw"

type StructuredContent = {
  blocks: ContentBlock[]
}

type ContentBlock =
  | { type: "paragraph"; text: string; nodes: InlineNode[] }
  | { type: "heading"; level: number; text: string }
  | { type: "separator" }

type InlineNode =
  | { type: "text"; text: string }
  | { type: "ruby"; base: string; reading: string }
  | { type: "annotation"; text: string; note: string }
```

### 4.4 検索結果（SearchResult）

```typescript
type SearchResult<T> = {
  total: number
  page: number
  perPage: number
  items: T[]
  snippets?: Record<string, string>  // 全文検索時のヒット前後文（server のみ）
}
```

### 4.5 エラーレスポンス（ErrorResponse）

```typescript
type ErrorResponse = {
  error: {
    code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST" | "INTERNAL_ERROR" | "NOT_SUPPORTED"
    message: string
    details?: unknown
  }
}
```

| HTTP Status | code | 説明 |
|---|---|---|
| 400 | `BAD_REQUEST` | クエリパラメータ不正 |
| 403 | `FORBIDDEN` | 著作権存続作品の本文取得 |
| 404 | `NOT_FOUND` | 作品・人物が存在しない |
| 500 | `INTERNAL_ERROR` | サーバー内部エラー |
| 501 | `NOT_SUPPORTED` | workers で未対応の機能（全文検索等） |
| 503 | `DB_NOT_READY` | DB ビルド中（server のみ） |

---

## 5. データソース

| データ | URL | 更新頻度 |
|---|---|---|
| メタデータ CSV | `aozorabunko/aozorabunko` — `index_pages/list_person_all_extended_utf8.zip` | 毎日自動更新 |
| 本文テキスト | `aozorahack/aozorabunko_text` — `files/{id}_ruby.zip` | 毎日自動更新 |

---

## 6. Phase 1: core

### 6.1 役割

workers・server 両方から参照する共通ロジック。ランタイム非依存（Node.js・Workers どちらでも動作）。

### 6.2 ディレクトリ構成

```
packages/core/
├── src/
│   ├── types/
│   │   └── index.ts          # Work・Person・WorkContent・SearchResult・ErrorResponse
│   ├── csv-parser.ts          # GitHub CSV パース・最小フィールド抽出
│   ├── decompress.ts          # zip 展開（fflate）
│   ├── decode.ts              # Shift-JIS → UTF-8（TextDecoder）
│   └── formatter.ts           # plain / html / raw 変換（青空文庫記法処理）
├── tests/
│   ├── csv-parser.test.ts
│   ├── decompress.test.ts
│   ├── decode.test.ts
│   └── formatter.test.ts
└── package.json               # name: "@aozora/core"
```

### 6.3 各モジュールの責務

**`csv-parser.ts`**

- GitHub raw から取得した CSV を `WorkMeta[]` にパース
- 全フィールドではなく型定義のフィールドのみ抽出
- 入力: `ArrayBuffer`（zip 展開後の CSV バイト列）
- 出力: `Work[]`

**`decompress.ts`**

- fflate を使った zip 展開（WASM 不要・Workers 対応）
- 入力: `ArrayBuffer`
- 出力: `ArrayBuffer`（展開後）

**`decode.ts`**

- `TextDecoder('shift_jis')` による UTF-8 変換
- 入力: `ArrayBuffer`
- 出力: `string`

**`formatter.ts`**

- 青空文庫記法テキストを各フォーマットに変換
- `plain`: 記法・ルビ除去
- `html`: `<ruby>` タグ展開
- `raw`: 無変換（そのまま返す）
- 入力: `string`（UTF-8 変換済みテキスト）, `ContentFormat`
- 出力: `string`

### 6.4 テスト方針

Phase 1 でテストまで完成させる。  
formatter は青空文庫記法の実例（走れメロス等）を fixture として使う。

### 6.5 技術スタック

| 項目 | 採用 |
|---|---|
| 言語 | TypeScript |
| zip 展開 | fflate |
| テスト | Vitest |
| ビルド | tsup（ESM + CJS デュアル出力） |

---

## 7. Phase 2: workers

### 7.1 アーキテクチャ

```
                  ┌──────────────────────────────────────────┐
                  │  Cloudflare Edge                          │
                  │                                           │
HTTP ────────────▶│  Workers (Hono)                          │
                  │      │                                    │
                  │      ├─ メタデータ系                      │
                  │      │   ├─ KV["meta:all"] HIT → filter  │
                  │      │   └─ KV MISS → GitHub fetch → KV  │
                  │      │                                    │
                  │      └─ 本文系                            │
                  │          ├─ KV["content:{id}"] HIT → 即返 │
                  │          └─ KV MISS → GitHub fetch → KV  │
                  └──────────────────────┬───────────────────┘
                                         │ fetch
                          ┌──────────────┴──────────────┐
                          │  GitHub raw                  │
                          │  ├─ CSV zip（メタデータ）    │
                          │  └─ {id}_ruby.zip（本文）   │
                          └─────────────────────────────┘
```

### 7.2 KV キー設計

| キー | 値 | TTL | 説明 |
|---|---|---|---|
| `meta:all` | `Work[]` JSON（~3-5MB） | 24h | TTL 切れで次リクエスト時に自動再取得 |
| `content:{id}` | UTF-8 テキスト | なし（永続） | 一度書いたら変更なし |

### 7.3 ディレクトリ構成

```
packages/workers/
├── src/
│   ├── index.ts              # Hono エントリーポイント（Worker 向け）
│   ├── routes/
│   │   ├── works.ts
│   │   ├── persons.ts
│   │   └── health.ts
│   ├── meta/
│   │   ├── index.ts          # KV["meta:all"] 取得・TTL 管理
│   │   └── filter.ts         # インメモリ filter / sort
│   └── content/
│       └── index.ts          # KV["content:{id}"] 取得・遅延キャッシュ
├── wrangler.toml
└── package.json
```

### 7.4 メタデータ取得フロー

```typescript
async function getMeta(env: Env): Promise<Work[]> {
  const cached = await env.KV.get("meta:all", "json") as Work[] | null;
  if (cached) return cached;

  const res = await fetch(
    "https://raw.githubusercontent.com/aozorabunko/aozorabunko/master/index_pages/list_person_all_extended_utf8.zip"
  );
  const works = parseCSV(await decompress(await res.arrayBuffer()));
  await env.KV.put("meta:all", JSON.stringify(works), { expirationTtl: 86400 });
  return works;
}
```

### 7.5 本文取得フロー

```typescript
const CONTENT_BASE =
  "https://raw.githubusercontent.com/aozorahack/aozorabunko_text/master/files";

async function getContent(workId: string, env: Env): Promise<string> {
  const cached = await env.KV.get(`content:${workId}`);
  if (cached) return cached;

  const paddedId = workId.padStart(6, "0");
  const res = await fetch(`${CONTENT_BASE}/${paddedId}_ruby.zip`);
  if (!res.ok) throw new NotFoundError();

  const text = decode(await decompress(await res.arrayBuffer()));
  await env.KV.put(`content:${workId}`, text);
  return text;
}
```

### 7.6 無料枠見積もり

| サービス | 無料枠 | 実態 |
|---|---|---|
| Workers | 10 万 req/日 | 余裕 |
| KV reads | 10 万/日 | メタ 1 件 + 本文 1 件/req |
| KV writes | 1,000/日 | 本文初回キャッシュのみ（遅延書き込み） |
| KV storage | 1 GB | CSV ~5MB + 本文 ~300MB |

トラフィック急増時は KV → R2 に差し替えるだけで対応可。

### 7.7 パフォーマンス目標

| 操作 | 目標 |
|---|---|
| メタデータ（KV HIT） | < 100ms |
| メタデータ（KV MISS・24h に 1 回） | 2〜5s |
| 本文（KV HIT） | < 100ms |
| 本文（KV MISS・初回のみ） | 500ms〜3s |

### 7.8 技術スタック

| 項目 | 採用 |
|---|---|
| Runtime | Cloudflare Workers |
| HTTP Framework | Hono |
| キャッシュ | Workers KV |
| デプロイ | wrangler |

### 7.9 `wrangler.toml`

```toml
name = "aozora-workers"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[[kv_namespaces]]
binding = "KV"
id = "<your-kv-id>"
```

### 7.10 `/v1/health` レスポンス

```json
{
  "status": "ok",
  "mode": "workers",
  "lastSyncedAt": "2026-03-26T02:03:41Z",
  "worksCount": 17423,
  "personsCount": 1891
}
```

---

## 8. TODO: server

### 8.1 アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│  Docker Container                                │
│                                                  │
│  ┌─────────┐   ┌────────────────────────────┐   │
│  │  Hono   │──▶│  SearchEngine (interface)  │   │
│  │  HTTP   │   │  └─ SqliteSearchEngine     │   │
│  └─────────┘   └────────────────────────────┘   │
│                          │                       │
│               ┌──────────┴──────────┐            │
│               │  aozora.db (SQLite) │            │
│               │  ├─ works           │            │
│               │  ├─ persons         │            │
│               │  └─ works_fts (FTS5)│            │
│               └─────────────────────┘            │
└─────────────────────────────────────────────────┘
```

### 8.2 技術スタック

| 項目 | 採用 |
|---|---|
| Runtime | Node.js + TypeScript |
| HTTP Framework | Hono |
| DB | SQLite（better-sqlite3） |
| 全文検索 | SQLite FTS5 + bigram |
| コンテナ | Docker + Docker Compose |

### 8.3 全文検索

```sql
CREATE VIRTUAL TABLE works_fts USING fts5(
  work_id UNINDEXED,
  title,
  content,
  tokenize = 'unicode61'  -- bigram 分割はアプリ側で投入時に実施
);
```

### 8.4 初回ビルドフロー

```
docker compose up
  └─ aozora.db 未存在 → build:db 実行
      ├─ 1. CSV ダウンロード・パース
      ├─ 2. 本文 zip 一括ダウンロード（約 1.6GB）
      ├─ 3. Shift-JIS → UTF-8 変換（core/decode 使用）
      ├─ 4. SQLite メタデータ投入
      ├─ 5. 本文 bigram 分割 → FTS5 インデックス構築
      └─ 6. Hono サーバー起動
```

初回ビルド目安: 20〜40 分 / DB サイズ目安: 2〜3 GB

### 8.5 リソース要件

| リソース | 最小 | 推奨 |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| Memory | 512 MB | 1 GB |
| Disk | 4 GB | 8 GB |

### 8.6 パフォーマンス目標

| 操作 | 目標 |
|---|---|
| メタデータ検索（単純） | < 50ms |
| メタデータ検索（複合条件） | < 100ms |
| 全文検索（FTS5） | < 300ms |
| 本文取得（plain） | < 100ms |
| 本文取得（structured） | < 300ms |

### 8.7 差分更新

`ENABLE_AUTO_UPDATE=true` 設定時、起動時に CSV の `最終更新日` を比較して追加・更新作品のみ再インデックス。

---

## 9. 実装フェーズ

### Phase 1: core（完了）

- [x] モノレポ初期設定（pnpm workspace・tsconfig・vitest）
- [x] `types/index.ts`（全型定義）
- [x] `csv-parser.ts` + テスト
- [x] `decompress.ts` + テスト
- [x] `decode.ts` + テスト
- [x] `formatter.ts`（plain / html / raw）+ テスト

### Phase 2: workers（テスト完了・デプロイ未実施）

- [x] Hono エントリーポイント・wrangler 設定
- [x] `services/metadata.ts`（KV 取得・TTL 管理）
- [x] `services/filter.ts`（インメモリ filter / sort / paginate）
- [x] `services/content.ts`（KV 取得・遅延キャッシュ）
- [x] routes: works・persons・health
- [x] `X-Cache-Status` ヘッダー実装
- [x] 全文検索 501 レスポンス実装
- [x] サービス層単体テスト（filter / metadata / content）
- [x] ルート層統合テスト（works / persons / health）
- [ ] wrangler deploy 動作確認

### TODO: server

- [ ] SQLite スキーマ・マイグレーション
- [ ] `pipeline/build.ts`（初回ビルド）
- [ ] `pipeline/update.ts`（差分更新）
- [ ] `pipeline/bigram.ts`（bigram 分割）
- [ ] `search/interface.ts` + `search/sqlite.ts`
- [ ] routes: works・persons・health・ndcs
- [ ] Docker + docker-compose.yml
- [ ] structured フォーマット実装

### 将来候補

- [ ] MCP サーバー対応
- [ ] OpenAPI（Swagger）ドキュメント生成
- [ ] 全文検索スニペット（ヒット前後文）
- [ ] ファセット集計
- [ ] 外部全文検索エンジン差し替え（SearchEngine interface 経由）

---

## 10. 移行パス（workers → server）

API インターフェースが同一のため、以下のみで切り替え可能：

1. `aozora-server` を VPS に Docker デプロイ
2. DNS / リバースプロキシで向き先を変更
3. クライアントコードの変更ゼロ

---

## 11. ライセンス・著作権

- 本ソフトウェア: MIT License
- 青空文庫メタデータ（CSV）: CC BY 2.1 JP
- 青空文庫収録テキスト: 各著作物の取り扱い規準に準拠
- 著作権存続作品の本文は API 経由でも提供しない（`copyrightFlag: true` → 403）
