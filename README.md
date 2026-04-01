# libroaozora

青空文庫のメタデータ検索・本文取得を提供する REST API。

## 構成

pnpm workspace によるモノレポ。

| パッケージ | 説明 |
|---|---|
| `@libroaozora/core` | 共通基盤（型定義・CSV パーサー・zip 展開・Shift-JIS 変換・フォーマッター） |
| `@libroaozora/workers` | Cloudflare Workers エッジ API（Hono + KV + R2） |

## API エンドポイント

Base: `/v1`

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/works` | 作品一覧（フィルタ・ソート・ページネーション） |
| GET | `/works/:id` | 作品詳細 |
| GET | `/works/:id/content` | 作品本文（著作権存続作品は 403） |
| GET | `/persons` | 人物一覧 |
| GET | `/persons/:id` | 人物詳細 |
| GET | `/persons/:id/works` | 人物の関連作品 |
| GET | `/health` | ヘルスチェック |
| GET | `/stats` | 統計情報 |

## 技術スタック

- **言語**: TypeScript 5.8（strict mode）
- **パッケージ管理**: pnpm workspace
- **ビルド**: tsup（ESM + CJS）
- **テスト**: Vitest + @cloudflare/vitest-pool-workers
- **HTTP**: Hono v4
- **ランタイム**: Cloudflare Workers
- **ストレージ**: Cloudflare KV + R2
- **zip 展開**: fflate

## ストレージ構成

| ストレージ | 役割 | 内容 |
|---|---|---|
| KV | ホットキャッシュ | メタデータ・本文テキストを TTL 付きで保持 |
| R2 | 原本ストア | GitHub から取得したデータの永続コピー |
| GitHub | オリジン | 青空文庫の CSV・本文 zip の取得元 |

リクエスト時は KV → R2 → GitHub の順にフォールバックし、取得したデータを上位層に書き戻します。

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

## 開発

```bash
# Workers ローカル開発サーバー
pnpm --filter @libroaozora/workers dev

# テスト
pnpm test

# 型チェック
pnpm lint
```

## デプロイ

```bash
pnpm --filter @libroaozora/workers deploy
```

デプロイ完了時に `https://libroaozora.<your-subdomain>.workers.dev` が表示されます。初回デプロイ後、Cloudflare ダッシュボードの Workers > Triggers から Cron を手動実行してメタデータを同期してください。以降は毎週月曜 UTC 03:00 に自動同期されます。

## ライセンス

MIT
