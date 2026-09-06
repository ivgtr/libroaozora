# Step 1 調査記録

2026-09-06 JST。調査・設計・タスク化のみ実施。プロダクトコード、既存の暫定差分、本番データは変更していない。
範囲の正本は [合意済み計画](./official-origin-plan.md)。具体的な判断は [実行設計](./official-origin-design.md)、実装は次回の [タスク一覧](./official-origin-tasks.md) に従う。

## 調査の境界と指示

- 親ディレクトリ `aozora` はGitリポジトリではない。`libroaozora` と `dayroaozora` は独立したリポジトリ。
- HEADはそれぞれ `279a453c39e92b9cb81b394a6f2a7c47bb757d59`、`95d60bd41b8d8176eb8d80ed4db7933e6d9a299d`。本番のコミットではない。
- 親階層・両リポジトリに適用される `AGENTS.md` は見つからなかった。両方の `CLAUDE.md` とREADMEを確認した。
- libroの制約: 依存はworkers/webからcoreの一方向、coreはランタイム非依存、著作権存続作品は403、Workersはplain/raw配信のみ。dayroは変更後のbuild/lint/testを要求する。
- `CLAUDE.md` が指す `.docs/` は両リポジトリとも存在しない。現存する親docsの合意済み資料を使用し、不在の旧仕様を推測して補わない。
- libroの `.claude/commands/speckit.tasks.md` の考え方（利用者の到達点、独立検証、ID付きチェックリスト、依存関係）を取り入れる。`.specify` は存在せず、今回CLI初期化、ブランチ作成、issue作成はしない。

## 未コミット差分の意図と扱い

ステージ済み差分は両方ともなし。下記は開始時から存在し、Step 1ではそのまま保存する。

| 対象 | 意図・根拠 | Step 2での扱い |
| --- | --- | --- |
| libro `packages/workers/src/services/content.ts` | ミラー404/410だけ公式へフォールバック。段階別に元例外を記録 | Aでミラー変換・再取得分岐を撤去。ログを維持・整備。Bでキャッシュ障害の挙動を変更 |
| libro `packages/workers/src/errors.ts` | 未処理例外のpathと元例外を記録 | 維持。公開エラーには内部情報を出さない |
| libro 未追跡 `packages/workers/tests/services/content-origin.test.ts`、`tests/fixtures/047927.json` | 実ZIP、デコード、ルート、ローカルKV/R2を通した回帰検証 | フィクスチャを維持。ミラー回復の期待値を公式1回へ変更。致命的KV失敗を期待する2ケースはBで成功・次層遷移を期待するテストへ変更 |
| libro 未追跡 `docs/investigations/47927/` | HTTP・実通信検証と原因未確定部分の保存 | 履歴として維持。既存報告を今回の実装完了に書き換えない |
| dayro `src/app/api/works/[id]/route.ts`、`src/__tests__/api/works-id.test.ts` | 中継502の元例外をサーバーログに残す | 維持。Cでcodeによる分類・互換フィールドを追加 |
| dayro 未追跡 `src/__tests__/lib/libroaozora.test.ts`、`src/__tests__/fixtures/047927.json` | 本番メタデータと公式由来raw本文を実パーサーへ通す | 維持。Cの応答統合時に旧応答互換ケースにも利用 |

意図は差分・テスト名・[47927調査記録](../investigations/47927/README.md)で確認できる。特に「KV保存失敗を致命的のまま維持」は調査範囲を限定するための暫定措置であり、合意済み計画の最終仕様ではない。

## 現行経路と不足

| 層・根拠ファイル | 現在の挙動 | 実装上の注意 |
| --- | --- | --- |
| libro `services/content.ts` | KV `content:{id}` → R2 URL pathname → GitHub → 一部公式。KV30日、R2期限指定なし | KV/R2 get例外は致命的。R2 body通信例外も削除対象。公式成功後KV put失敗も致命的。版・共有Map・サイズ制限なし |
| libro `routes/works.ts` | メタデータの存在→権利→URL確認後に本文。raw/plainとX-Cache-Status | 先行修正もこのチェック順を維持。`047927`/`000789`は上流6桁、dayroは数値ID |
| libro `services/metadata.ts` | KV3キーを並列取得、揃えば採用。なければR2 `metadata.json` | KV例外で本文まで到達しない。KVの世代混在が可能。R2 text通信例外も破損として削除し得る |
| libro `scripts/sync-metadata.ts` | GitHub CSV、R2上書き→KV3キー順次書込み | ダウンロード期限、厳密なCSV検証、同期テスト、世代公開なし。モジュール読み込みでmain実行。検証時に直接import/runしない（remote書込みを行う） |
| libro `.github/workflows/sync-metadata.yml` | 手動のみ、週次scheduleコメントアウト、concurrencyなし | Cで日次化する前に手動成功・新旧互換・公開の直列化を確認 |
| core `csv-parser.ts`、`lib/csv-parse.ts` | 本文URLだけ保持。欠損作品IDをスキップ、欠損権利フラグはfalse、閉じていない引用符も許容 | パーサー成功だけを公開判定にしない。同期入力の検証で権利列等の欠損・不正を拒否する。作品・人物重複行自体は正常 |
| core `decompress.ts` | `unzipSync`で拡張子一致ファイルをすべて展開し、名前順の先頭を返す | Content-Length/ZIPの申告サイズだけで上限を保証できない。展開出力の実バイト数で停止できる実装がBに必要 |
| dayro `lib/libroaozora.ts` | メタデータ・本文を並列fetchし構造化。HTTP404だけ専用例外 | 世代をまたいだtitle/authorsと本文の合成が可能。通信期限・安定code分類なし |
| dayro `lib/content-cache.ts` | DB_VERSION=1、CACHE_VERSION=2。workIdキー、毎回lastAccessedAtを延長して即返す | 更新確認なし。単純なCACHE_VERSION変更は旧本文の削除を招く。put成功をtransaction完了前に解決するため、移行時はabortも検証 |
| dayro `ReadingClient.tsx` | 今日の本文取得後、段落設定前に明日を先読み。10秒abortはtoday APIだけ | 表示成功後へ先読みを移動し、同日・同IDの重複を抑える。本文の期限は別途必要 |
| dayro `types/index.ts`、`lib/reading-state.ts`、`lib/bookshelf.ts`、`hooks/useReadingState.ts` | 今日の位置と本棚の位置を別保存。本文識別子なし | 今日・本棚の両入口、位置保存の全経路、completedと履歴の区別がDの対象 |
| dayro 本文APIルート | 正常応答に1h+24h SWR | 旧版・未検証の判定ができるCからno-store分岐を先行導入。正常応答のSWR撤去はD |
| libro `packages/web/src/lib/api-client.ts` | API応答・構造化本文をそれぞれ24hキャッシュ | API追加フィールドの互換検証に含める。dayroの画面更新保証をこのデモUIへ自動的に拡張しない |

## 公式CSVの保存済み資料の再検証

過去調査で取得済みの `/tmp/aozora-investigation/official-metadata.zip` をPython標準のZIP/CSV読出しで調べた。今回公式への再ダウンロードや本番本文APIへのアクセスはしていない。
ZIP SHA-256: `a615fa6ddb6ef3e0ad598337f5d08f1570c3d2aa51cc5d43a62998ca904905be`。

- 19,502行、17,840作品、1,335人物。本文URL・本文更新日・修正回数が空の行はそれぞれ307。同一作品のこれら3値の競合は0。権利フラグ空欄は0。
- 列名は `テキストファイル最終更新日`、`テキストファイル修正回数`。47927は作品更新日2014-09-16、本文更新日2013-08-08、修正回数0。789は本文更新日2018-02-05、修正回数15。
- 全本文URLがaozoraホストという仮定は成り立たない。公式CSVには外部サイトのURLもある。合意済みの「sourceUrls.textへ直接アクセス」と既存互換を優先し、Aではホスト限定を追加しない。新たな取得先探索・別ミラーの追加はしない。
- 過去計測の単一JSON 11,309,473 bytesは本文更新情報追加前の値。今回の行数確認はこのサイズ・本番性能を再測定したものではない。更新フィールド込みのサイズはCで再測定する。

## ローカル検証（暫定差分込み）

| 検証 | 今回の結果 |
| --- | --- |
| libro core Vitest | 5ファイル / 55件成功 |
| libro Workers Vitest（workerd・ローカルKV/R2） | 7ファイル / 83件成功 |
| libro workspace lint | core型、Workersソース・同期scripts型、web ESLint成功 |
| libro Workers lint:test | 成功 |
| dayro Vitest | 14ファイル / 151件成功 |
| dayro ESLint、tsc（incremental false） | 成功 |
| dayro Next production build | 成功 |

環境はNode 26.3.1。PATHのpnpmではテスト開始前に `unable to open database file` が発生したため、既存キャッシュのpnpm 10.33.0を使用した。ルートscriptが別のpnpmを呼び直す問題を避け、libroでは `-r test` / `-r --parallel lint` を直接実行した。dayroは既存調査と同様に `NODE_OPTIONS=--no-experimental-webstorage` を付けた。依存更新・再インストールやプロダクト修正では解決していない。

再現用（各リポジトリ内、pnpm 10.33.0がPATHにある通常環境）:

```sh
# libroaozora。coreのdistがないクリーン環境では先にcore buildが必要
pnpm --filter @libroaozora/core build
pnpm -r test
pnpm -r --parallel lint
pnpm --filter @libroaozora/workers lint:test

# dayroaozora
NODE_OPTIONS=--no-experimental-webstorage pnpm test
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm build
```

今回の実行ログは `/tmp/official-origin-step1/`。現行テストは移行仕様を保証せず、KV致命的失敗・破損R2削除など旧挙動を肯定するケースも含む。テスト変更対象をタスクに明記した。HEADとの診断比較は行っておらず、失敗の導入コミット等の帰属判断はしていない。

検証前後で両repoの既存ファイル216件（Git/依存/ビルド出力ディレクトリを除外）のSHA-256を照合した。Next buildが再生成した `next-env.d.ts` は検証前と同じハッシュの内容へ戻し、既存ファイル・暫定差分の不変を確認した。追加・更新した成果物は親 `docs/` のみ。ビルド・テストの生成物は実装差分に含めない。

## 計画の補足・修正点

1. **Bへメタデータ読出し耐障害性の最小修正を追加**。本文サービスだけ直してもKV障害ではルートがそこへ到達しないため。単一世代化は引き続きC。
2. **Cの公開はreader→writer→初回同期→定期化の順**。旧readerは新キーを読めない。新readerが旧KV3キーを合成して使うことも避ける。復旧対象はv2を読める公式取得コードと正常snapshot。
3. **旧版応答のno-storeはCの提供開始と同時**。Dまで待つとCが返した旧版を中継が最大24h SWRへ載せてしまう。正常応答のSWR撤去はDで実施。
4. **Dの位置識別にはdayroの構造化・文分割の版も必要**。Workers rawハッシュだけではクライアント側のパーサー変更による文番号変化を検知できない。
5. **Bの共有キーはC以前でもURL込みにする**。sourceRevisionがまだないため作品ID+完全URLの暫定識別とし、Cで版識別に置き換える。

これらは合意済み挙動を実現するための依存補足であり、新基盤・課金プラン変更を伴わない。

## 未確認と質問を必要とする境界

本番の認証状態、契約枠、実際のbinding・lifecycle、デプロイ済みSHA、KV/R2の保存状態、同期権限、CPU/メモリ計測手段は今回未確認。プレースホルダーのローカルwrangler設定から本番設定を推定しない。過去報告の「未認証」を今回再確認済みと扱わない。

現時点でユーザー回答が必要な仕様上の保留はない。Step 2で測定により、契約変更・分散基盤追加・既存作品を提供対象外にする上限制限が必要と判明した場合に限り、根拠・費用/互換性への影響・代替案を提示して判断を求める。上限の具体値は測定タスクに残し、架空の値で完了させない。
