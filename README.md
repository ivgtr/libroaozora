# libroaozora

青空文庫のメタデータ検索・本文取得を提供する REST API とデモ Web UI。

## 構成

pnpm workspace によるモノレポ。

| パッケージ | 説明 |
|---|---|
| `@libroaozora/core` | 共通基盤（型定義・CSV パーサー・zip 展開・Shift-JIS 変換・フォーマッター） |
| `@libroaozora/workers` | Cloudflare Workers エッジ API（Hono + KV + R2） |
| `@libroaozora/web` | デモ Web UI（Next.js） |

## API エンドポイント

Base: `/v1`

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/works` | 作品一覧（`title`, `author`, `ndc`, `copyright` 等でフィルタ。`sort`, `page`, `per_page` 対応） |
| GET | `/works/:id` | 作品詳細 |
| GET | `/works/:id/content` | 作品本文（`format`: `plain`（デフォルト）/ `raw`。著作権存続作品は 403） |
| GET | `/persons` | 人物一覧（`name` でフィルタ。`sort`, `page`, `per_page` 対応） |
| GET | `/persons/:id` | 人物詳細 |
| GET | `/persons/:id/works` | 人物の関連作品（`page`, `per_page` 対応） |
| GET | `/health` | ヘルスチェック（常に 200、未同期時は `status: "degraded"`） |
| GET | `/stats` | 統計情報（未同期時は 503） |

## ストレージ構成

| ストレージ | 役割 | 内容 |
|---|---|---|
| KV | ホットキャッシュ（TTL 30 日） | メタデータ JSON・本文テキスト |
| R2 | 永続ストア | メタデータ JSON・本文 zip |

## セットアップ

Node.js 22以上、pnpm 10.33.0を使用してください（Wranglerの実行要件）。

```bash
pnpm install
pnpm build
```

### Workers の設定

1. 設定ファイルをコピー

   ```bash
   cp packages/workers/wrangler.toml.example packages/workers/wrangler.toml
   ```

2. Cloudflare リソースを作成

   ```bash
   wrangler kv namespace create libroaozora-kv
   wrangler r2 bucket create libroaozora-data
   ```

3. KV 作成時に表示される namespace ID を `wrangler.toml` の `kv_namespaces.id` に記入（R2 の bucket 名は example の既定値と一致するためそのまま使用）

### Web UI の設定

```bash
cp packages/web/.env.local.example packages/web/.env.local
```

`API_BASE_URL` に Workers の URL を設定してください。ローカル開発時は `http://localhost:8787`、本番環境ではデプロイ済みの URL を指定します。

## 開発

```bash
# Workers ローカル開発サーバー (localhost:8787)
pnpm --filter @libroaozora/workers dev

# Web UI ローカル開発サーバー (localhost:3000)
pnpm --filter @libroaozora/web dev

# テスト
pnpm test

# 型チェック
pnpm lint
```

## デプロイ

```bash
pnpm --filter @libroaozora/workers run deploy
```

## メタデータ同期

デプロイ後、メタデータの同期を実行する必要があります。同期を行うまで `/v1/works`・`/v1/persons`・`/v1/stats` は 503 を返し、`/v1/health` は `status: "degraded"` を返します。

```bash
KV_NAMESPACE_ID=<your-kv-namespace-id> pnpm --filter @libroaozora/workers run sync
```

同期スクリプトは青空文庫の CSV をダウンロード・パースし、R2 と KV にメタデータを書き込みます。GitHub Actions の手動トリガー（`workflow_dispatch`）でも実行できます。

## ライセンス

MIT

## 公式取得への移行

本文とメタデータCSVは青空文庫の配布URLから直接取得します。本文はAPIアクセス時にKV→R2→配布元の順に取得し、保存だけの障害では正常本文を返します。本文TTLは30日、R2 ZIPは期限なしです。

A/Bの設定・検証・本番反映の前提は [リリース記録](docs/investigations/official-origin-release.md)、[上限の測定](docs/investigations/official-origin-limits.md) を参照してください。更新版への対応とブラウザ再検証は続くC/D段階です。
