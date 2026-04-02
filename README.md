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
| GET | `/works` | 作品一覧（フィルタ・ソート・ページネーション） |
| GET | `/works/:id` | 作品詳細 |
| GET | `/works/:id/content` | 作品本文（著作権存続作品は 403） |
| GET | `/persons` | 人物一覧（フィルタ・ソート・ページネーション） |
| GET | `/persons/:id` | 人物詳細 |
| GET | `/persons/:id/works` | 人物の関連作品 |
| GET | `/health` | ヘルスチェック（常に 200、未同期時は `status: "degraded"`） |
| GET | `/stats` | 統計情報（未同期時は 503） |

## ストレージ構成

| ストレージ | 役割 | 内容 |
|---|---|---|
| KV | ホットキャッシュ（TTL 3 日） | メタデータ JSON・本文テキスト |
| R2 | 永続ストア | メタデータ JSON・本文 zip |

## セットアップ

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

`API_BASE_URL` にデプロイ済みの Workers URL を設定してください。

## 開発

```bash
# Workers ローカル開発サーバー
pnpm --filter @libroaozora/workers dev

# Web UI ローカル開発サーバー
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
