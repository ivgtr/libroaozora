# libroaozora

青空文庫のメタデータ検索・本文取得を提供する REST API。

## プロジェクト構成

pnpm workspace によるモノレポ。依存は常に一方向（`workers → core`、`web → core`）。`web` は `workers` API を Server Components 経由で呼び出し、API URL をクライアントに露出しない。

| パッケージ | 説明 |
|---|---|
| `@libroaozora/core` | 共通基盤（型定義・CSVパーサー・zip展開・Shift-JIS変換・フォーマッター） |
| `@libroaozora/workers` | Cloudflare Workers 実装（Hono + KV + R2） |
| `@libroaozora/web` | デモ Web UI（Next.js・Server Components・CSS Modules） |

## 技術スタック

- **言語**: TypeScript（strict mode）
- **パッケージ管理**: pnpm workspace
- **ビルド**: tsup（ESM + CJS デュアル出力）
- **テスト**: Vitest + @cloudflare/vitest-pool-workers
- **HTTP**: Hono v4
- **ランタイム**: Cloudflare Workers
- **ストレージ**: Cloudflare KV（ホットキャッシュ）+ R2（原本ストア）
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
- Phase 2: workers（Hono + KV + R2 によるエッジAPI、外部メタデータ同期）
- TODO: server（Node.js + SQLite + FTS5）

## 制約

- `core` は他パッケージに依存しない。ランタイム非依存（Node.js・Workers両対応）
- 著作権存続作品の本文は提供しない（`copyrightFlag: true` → 403）
- workers での全文検索は 501 Not Implemented を返す
