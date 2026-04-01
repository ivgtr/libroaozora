# libroaozora Constitution

## Core Principles

### I. 仕様書駆動
`.docs/aozora-requirements.md` が唯一の仕様原本。実装の正しさは仕様書との整合性で判断する。仕様に記載のない振る舞いを勝手に追加しない。

### II. ランタイム非依存の共通基盤
`@libroaozora/core` は Node.js・Cloudflare Workers どちらでも動作すること。Web API（fetch, TextDecoder 等）のみに依存し、Node.js 固有 API や Workers 固有 API を使用しない。

### III. 一方向依存
パッケージ間の依存は `workers → core`、`server → core` の一方向のみ。`core` は他パッケージに依存しない。循環依存を作らない。

### IV. API 互換性
workers と server は URL・レスポンス形式・エラー形式を完全に同一とする。クライアントはどちらの実装を使っているか意識しなくてよい設計を維持する。

### V. 著作権遵守
著作権存続作品（`copyrightFlag: true`）の本文は API 経由で提供しない。メタデータのみ返し、本文リクエストには 403 を返す。

## 技術制約

- TypeScript strict mode を常に有効にする
- `core` のビルドは tsup で ESM + CJS デュアル出力
- テストは Vitest で記述し、実装前にテストを確認する
- zip 展開は fflate を使用（WASM 不要・Workers 対応）
- Shift-JIS → UTF-8 変換は `TextDecoder('shift_jis')` を使用

## 品質基準

- 場当たり的な修正を避け、設計レベルで正しいかを常に考える
- バグ修正時は根本原因を特定してから修正する
- テストが通らない場合、テストコードを変更するのではなく実装を見直す
- 不要なコード・コメント・抽象化を追加しない

## Governance

この Constitution はプロジェクトの全実装判断において最上位の権威を持つ。仕様書（`.docs/aozora-requirements.md`）と並んで遵守される。変更には理由の文書化が必要。

**Version**: 1.0.0 | **Ratified**: 2026-04-01 | **Last Amended**: 2026-04-01
