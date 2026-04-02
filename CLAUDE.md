# libroaozora

青空文庫のメタデータ検索・本文取得を提供する REST API とデモ Web UI。

## プロジェクト構成

pnpm workspace によるモノレポ。依存は常に一方向（`workers → core`、`web → core`）。

| パッケージ | 説明 |
|---|---|
| `@libroaozora/core` | 共通基盤（型定義・テキスト処理・パーサー） |
| `@libroaozora/workers` | Cloudflare Workers エッジ API（Hono + KV + R2） |
| `@libroaozora/web` | デモ Web UI（Next.js・Server Components） |

## 開発コマンド

```bash
pnpm build        # 全パッケージビルド
pnpm test         # テスト実行
pnpm test:watch   # テスト監視モード
pnpm lint         # 型チェック
```

## 仕様書

`.docs/` 配下にフェーズごとの仕様書がある。実装は仕様書に忠実に行う。仕様と実装が矛盾する場合は仕様書を正とする。

## 制約

- `core` は他パッケージに依存しない。ランタイム非依存（Node.js・Workers 両対応）
- 著作権存続作品の本文は提供しない（`copyrightFlag: true` → 403）
- workers API の責務はデータの取得・キャッシュ・配信。本文フォーマットは `plain`・`raw` のみ提供し、表示向け変換は API の責務外
- `web` は `format=raw` で取得し、core のパーサーで構造化して表示する
