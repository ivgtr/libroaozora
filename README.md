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
| GET | `/health` | ヘルスチェック（メタデータ取得不可時も 200 / `status: "degraded"`。鮮度は `metadataState`・`lastSyncedAt` で確認） |
| GET | `/stats` | 統計情報（メタデータ取得不可時は 503） |

## ストレージ構成

| ストレージ | 役割 | 内容 |
|---|---|---|
| KV | ホットキャッシュ（メタデータは3日、本文は30日） | 世代別メタデータ JSON・版別本文envelope |
| R2 | 永続ストア | current/previous pointer・immutable snapshot・版別本文 zip |

## セットアップ

Node.js 22以上、pnpm 10.33.0を使用してください（Wranglerの実行要件）。

```bash
pnpm install
```

### Workers の設定

1. 設定ファイルをコピー

   ```bash
   cp packages/workers/wrangler.toml.example packages/workers/wrangler.toml
   ```

2. `packages/workers/` でインストール済みの Wrangler を使い、認証と Cloudflare リソースの作成を行う

   ```bash
   cd packages/workers
   node node_modules/wrangler/bin/wrangler.js login
   node node_modules/wrangler/bin/wrangler.js whoami
   node node_modules/wrangler/bin/wrangler.js kv namespace create libroaozora-kv --config wrangler.toml
   node node_modules/wrangler/bin/wrangler.js r2 bucket create libroaozora-data --config wrangler.toml
   cd ../..
   ```

3. 対象の Cloudflare account ID を `packages/workers/wrangler.toml` のトップレベルの `account_id` に、KV 作成時の namespace ID を `kv_namespaces.id` に記入する。複数 account がある場合は、リソース作成前に `account_id` を設定する（R2 の bucket 名は example の既定値と一致するためそのまま使用）。

### Web UI の設定

`packages/web/.env.local` を作成し、次を設定します。

```dotenv
API_BASE_URL=http://localhost:8787
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

本番環境では `API_BASE_URL` に Workers の URL、`NEXT_PUBLIC_BASE_URL` に Web UI の公開 URL を指定します。設定後、リポジトリルートで `pnpm build` を実行してください。

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
cd packages/workers
node node_modules/wrangler/bin/wrangler.js deploy --name libroaozora --config wrangler.toml --keep-vars
cd ../..
```

## メタデータ同期

メタデータは青空文庫の公式CSVから取得し、[GitHub Actions](.github/workflows/sync-metadata.yml) で同期します。本文は同期対象に含まず、本文APIへのアクセス時に取得します。

Worker をデプロイした後、同じ account・KV を指すリポジトリ secrets `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`KV_NAMESPACE_ID` と、variable `OFFICIAL_METADATA_WRITER_ENABLED=true` を設定します。workflow の同期先 R2 bucket は `libroaozora-data` です。別名を使う場合は workflow の同期ステップに環境変数 `R2_BUCKET` を追加してください。トークンには対象の R2 オブジェクトと KV の読み書き権限が必要です。

デフォルトブランチ（このリポジトリでは `main`）から手動実行します。

```bash
gh workflow run sync-metadata.yml --ref main
```

同期スクリプトは GitHub Actions 経由で実行します。定期実行は workflow 内でコメントアウトされており、手動同期の成功後に毎日03:00 UTC（12:00 JST）の schedule を有効化できます。読み出せるメタデータがない場合、作品・人物・stats API は503、health は `degraded` を返します。

## ライセンス

MIT
