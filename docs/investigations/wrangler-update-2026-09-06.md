# Wrangler更新記録

2026-09-06 JST。ユーザー指定のWrangler更新。公式取得元への切替（Step 2）、ログイン、remote同期、デプロイは実施していない。

## 更新範囲

| 依存 | 更新前の解決版 | 更新後の解決版 |
| --- | --- | --- |
| wrangler | 4.79.0 | 4.129.0 |
| @cloudflare/workers-types | 4.20260331.1 | 5.20260903.1 |
| @cloudflare/vitest-pool-workers | 0.14.0 | 0.22.0 |

Wranglerのpeer型に合わせWorkers型を更新し、旧Wrangler/Miniflareを固定依存していたテストプラグインも更新した。Vitest本体やHono/Next等の直接依存は変更していない。プラグイン内部はWrangler 4.124.0/Miniflare 5.20260815.0-alpha、CLI側はWrangler 4.129.0/Miniflare 5.20260903.0-alphaという公式パッケージの依存を維持し、overrideで無理に統一していない。lockfileの拡大には両ランタイムのプラットフォーム別パッケージを含む。

Node.js最低要件はWranglerに合わせroot enginesとREADMEを22以上へ変更。既存workflowはNode 22で適合。compatibility_date=2026-01-01は維持した。

参照した[Wrangler変更履歴](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/CHANGELOG.md)ではNode 22必須化、認証改善、compatibility dateに応じたNode互換の変更を確認した。[テストプラグイン変更履歴](https://github.com/cloudflare/workers-sdk/blob/main/packages/vitest-plugin/CHANGELOG.md)のMiniflare override削除・MSW要件変更は、当repoでは該当オプション/MSWを使用しておらず設定変更不要。既存cloudflareTest設定でテストを通した。

## 検証

pnpm 10.33.0、Node 26.3.1、既存の暫定差分込みで実施。

- `pnpm -r test`: core 55件、Workers 83件成功。
- `pnpm -r --parallel lint`、Workers `lint:test`: 成功。
- `pnpm -r build`: core、Workers dry-run、web Next build成功。本番uploadなし。
- `wrangler --version`: 4.129.0。
- `pnpm install --frozen-lockfile --ignore-scripts`: lockfile整合性確認。
- `git diff --check`: 成功。既存のcontent.ts/errors.ts差分と実データフィクスチャは保持。

PATHのpnpmは起動時DBエラーを再現したため、既存キャッシュのpnpm 10.33.0を直接実行。registry参照のnpm cache書込み先とpnpm storeは既存の/tmp配下を指定した。lockfile削除・キャッシュ消去・監査の自動修正は行っていない。変更時点のopen PR一覧は空。

## 監査と対象外

全依存の`pnpm audit --json`とworkspaceの`outdated --json`を実行。監査は更新前low 9 / moderate 50 / high 39 / critical 1、更新後low 6 / moderate 43 / high 34 / critical 1。監査の非ゼロ終了は検出結果であり実行不能ではない。更新後のユニークadvisoryは80件（重複経路等を含む上記集計とは異なる）。安全性の確認完了を意味しない。

残存にはroot Vitest 3.2.4の[UIサーバー経由の任意ファイル読出し・実行](https://github.com/advisories/GHSA-5xrq-8626-4rwp)（修正版3.2.6以上）が含まれる。今回の実行は`vitest run`でUIサーバーを起動していないが、利用環境全般への到達性は未確認。Hono/Next等の残存も、Wrangler更新の範囲で修正済み・非該当とは分類していない。

監査の各advisoryについて、依存版/経路、操作・入力・影響、修正版、出典、到達性未確認の分類を`/tmp/aozora-wrangler-update/audit-after-assessment.json`に保存。監査raw、更新前結果、outdated、ビルド/テストログも同ディレクトリに保存した。残存の担当はrepo保守者、再検討時点は別途依存修正タスク・該当サービスの公開前。今回の依頼を無関係な依存一括更新へ広げていない。
