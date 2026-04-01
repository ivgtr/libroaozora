# libroaozora

青空文庫のメタデータ検索・本文取得を提供する REST API。

## プロジェクト構成

pnpm workspace によるモノレポ。依存は常に一方向（`workers → core`）。

| パッケージ | 説明 |
|---|---|
| `@libroaozora/core` | 共通基盤（型定義・CSVパーサー・zip展開・Shift-JIS変換・フォーマッター） |
| `@libroaozora/workers` | Cloudflare Workers 実装（Hono + KV） |

## 技術スタック

- **言語**: TypeScript（strict mode）
- **パッケージ管理**: pnpm workspace
- **ビルド**: tsup（ESM + CJS デュアル出力）
- **テスト**: Vitest
- **HTTP**: Hono
- **ランタイム**: Cloudflare Workers（workers）/ Node.js（server, 将来）
- **zip展開**: fflate（WASM不要・Workers対応）

## 開発コマンド

```bash
pnpm build        # 全パッケージビルド
pnpm test         # テスト実行
pnpm test:watch   # テスト監視モード
pnpm lint         # 型チェック
```

## 仕様書

- `.docs/aozora-requirements.md` — API仕様・データ型・フェーズ定義の原本

実装は仕様書に忠実に行う。仕様と実装が矛盾する場合は仕様書を正とする。

## 実装フェーズ

- Phase 1: core（型定義・CSVパーサー・decompress・decode・formatter）
- Phase 2: workers（Hono + KV によるエッジAPI）
- TODO: server（Node.js + SQLite + FTS5）

## 制約

- `core` は他パッケージに依存しない。ランタイム非依存（Node.js・Workers両対応）
- 著作権存続作品の本文は提供しない（`copyrightFlag: true` → 403）
- workers での全文検索は 501 Not Implemented を返す

## Active Technologies
- TypeScript 5.8 (strict mode) + Hono v4.7.5, @libroaozora/core (workspace), fflate, d3-dsv (003-workers-edge-api)
- Cloudflare Workers KV（メタデータ 3-5MB + 本文テキスト） (003-workers-edge-api)

## Recent Changes
- 003-workers-edge-api: Added TypeScript 5.8 (strict mode) + Hono v4.7.5, @libroaozora/core (workspace), fflate, d3-dsv
