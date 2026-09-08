# 公式取得・アクセス時保存の実行タスク

> 過去の計画・検証記録です。以下の「未反映」「未認証」等は記録当時の状態です。後続の公開・復旧と残件は [2026-09-08の確認状態](status-2026-09-08.md) を参照してください。

2026-09-06 JST。**Step 2実施中。ローカル実装と本番確認を分けて以下に記録する。**

範囲: [合意済み計画](./official-origin-plan.md)。調査: [現行・差分・検証結果](./official-origin-research.md)。
データモデル・API契約・設計判断: [実行設計](./official-origin-design.md)。既存の暫定修正はStep 1で変更していない。

パスの `L/` は `../../`、`D/` は `../../../dayroaozora/` を意味する。新規ファイル候補は「新規」と明記する。
各タスクは記載した検証を通過し、根拠（コマンド・結果・測定値）を残してからチェックする。実装済みと本番確認済みを混同しない。

## 依存関係とリリース単位

```text
T001 → T002(A) → T003(Bメタデータ) → T004(B本文) → T005(B共有)
                                 T004 → T006(B先読み)
                         T005 + T006 → T007(上限) → T008(A/B検証) → T009(先行リリース)

T008 → T010(C版モデル) → T011(C同期writer) → T012(Creader)
T010 + T005 → T013(C本文版保存)
T012 + T013 → T014(C旧版・契約) → T015(C中継) → T016(C統合) → T017(C公開)

T015 → T018(Dブラウザ) → T019(D位置) → T020(D表示・先読み)
T018 + T015 → T021(D CDN) → T022(D統合、T019/T020も必要) → T023(D公開・全体完了)
```

T009/T017/T023はStep 2以降のリリース作業。コードの検証までを先に完了し、対象・差分・確認/復旧手順をレビュー可能にしてから本番反映を扱う。今回の指示はデプロイを認可しない。
ローカルC開発はT009の本番待ちと独立に進められるが、Cの本番公開T017はT009完了後。D開発もC本番待ちと独立、D本番T023はT017完了後。

| 範囲 | 独立した検証・先行公開 |
| --- | --- |
| A / T002 | 公式本文・CSV切替として単独レビュー可。B/C/Dを実装済みと扱わない |
| A/B / T001〜T009 | US1の先行リリース。公式移行、キャッシュ耐障害性、重複抑制、先読み停止、契約上限確認まで。訂正の画面反映は未完 |
| C / T010〜T017 | US2。版別本文と同一世代metadata、許可条件付き旧版提供。ブラウザ旧保存の訂正反映はまだ未完 |
| D / T018〜T023 | US3。ブラウザ再検証、CDNと位置移行まで含む全体完了 |

担当を分ける場合、T006とT005、T011とT013、T019とT021は前提完了後に別ファイル中心で作業できる。ただしこの記述はエージェント起動や並行実装の指示ではない。共有型・content.ts・ReadingClientの変更は順序を守って統合する。

## 準備

- [x] T001 開始時差分・検証環境を固定する — `L/docs/investigations/47927/`、両repoの `CLAUDE.md` / `package.json`、本書。
  **依存:** Step 2開始指示。**作業:** HEAD・status・staged/unstaged/未追跡差分を再確認し、調査記録の対応表と突合する。pnpm 10.33.0、core build、ローカルwrangler設定を確認。暫定差分の再利用/置換を実装差分に明示する。親docsをGit管理へ収める必要がある場合は、横断資料をL/docs/official-origin/へコピーしD側READMEから参照する案を採用し、公開前に参照切れを確認する。
  **完了条件・検証:** ユーザー差分を失わず、テスト実行可能。未追跡フィクスチャを含めたレビュー対象一覧を保存。本文全件取得やremote syncをセットアップで実行していない。

## US1 — 公式から読み、正常本文をキャッシュで守る（A/B）

- [x] T002 [US1] 本文・CSV取得先を公式配布URLへ切り替える — `L/packages/workers/src/services/content.ts`、`scripts/sync-metadata.ts`、`tests/services/content*.test.ts`、両repoの47927フィクスチャ/テスト、`L/README.md`。
  **依存:** T001。**作業:** resolveContentUrl/GitHub変換/404・410再fetchを除去、本文は完全なsourceUrls.text、CSVは合意済み公式ZIP URLを使用。10秒期限と元例外ログを維持。同期のダウンロード部分を安全にテストできる関数へ分離し、importでremote書込みを発生させない。
  **完了条件・検証:** 実47927 ZIP→coreデコード→ルート→dayro構造化が一致。fetchは配布URLへ1回、raw/plain・403/404チェック・成功応答形式維持。timeout/404/破損は保存ゼロ。ミラー成功/回復の旧期待値は削除または直接取得ケースに置換。同期URLのテストは書込みなし。同期全体の公開方式はまだ旧形式と明記。

- [x] T003 [US1] 本文の前提となるメタデータ読出しを耐障害化する — `L/packages/workers/src/services/metadata.ts`、`tests/services/metadata.test.ts`、`tests/routes/works.test.ts`。
  **依存:** T002。**作業:** KV読出し例外時に正常R2 snapshotへ進む。R2本文通信例外とJSON破損を分離し、どちらもリクエスト内で無条件削除しない。正常snapshotのKV再保存失敗を応答に伝播させない。世代キー移行はT012まで行わない。
  **完了条件・検証:** ルート経由でmetadata KV障害→R2→本文200、metadataも全部失敗なら503。権利制限はR2復元時も403。R2 text例外でdeleteゼロ。既存「破損→削除」テストを保護方針へ更新。旧KV3キーの世代混在はC待ちの制約として記録。

- [x] T004 [US1] 本文KV/R2の障害遷移と正常データ保存を実装する — `L/packages/workers/src/services/content.ts`、`tests/services/content.test.ts`、`content-origin.test.ts`。
  **依存:** T003。**作業:** KV read失敗→R2、R2 get/body失敗→公式。KV/R2不正キャッシュはミスとして扱い、正常取得後R2/KV保存を独立await。ZIP正常性の基本検証と供給元/保存結果ログを整備。
  **完了条件・検証:** KV hitはR2/公式ゼロ、R2 hitとKV期限切れは公式ゼロ。各read/put個別失敗と両put失敗で期待どおり200/次層遷移。通信例外でR2 deleteゼロ、不正公式ZIPを保存しない。暫定の「KV read失敗でthrow」「KV put失敗でthrow」を新仕様の回帰へ更新。X-Cache-Status互換維持。

- [x] T005 [US1] 同一実行環境内の取得共有・待機を追加する — `L/packages/workers/src/services/content.ts`、補助モジュール `src/services/content-control.ts`（新規候補）、`tests/services/content*.test.ts`。
  **依存:** T004。**作業:** 作品+URL、env単位でin-flight共有。内部の取得エラーをstatus/timeout/通信/不正ZIPに分類。finally解放、60秒待機、有効Retry-After、Map上限を設定可能にする。公開codeの追加はT014。
  **完了条件・検証:** Promise barrierで同時要求のfetch1回と結果一致、Response共有なし、成功/失敗後Map解放。異作品/異URL/異envは混線しない。仮想時計で60秒・429秒数/日付/無効値・上限・待機中正常cacheを検証。1要求内の自動再fetchなし。分散環境全体の1回保証はしない。

- [x] T006 [US1] 今日表示後の先読みと運用停止設定を実装する — `D/src/components/reading/ReadingClient.tsx`、`src/lib/content-cache.ts`、`src/app/api/today/route.ts`、`src/app/api/works/[id]/route.ts`、`src/types/index.ts`、`.env.example`、関連テスト。
  **依存:** T004。**作業:** 実行設計のPREFETCH_ENABLED・prefetchEnabled・prefetch=1を導入。表示成功後に翌日1件、同日同IDの反復なし。中継での停止をtoday CDNの残存に依存させない。
  **完了条件・検証:** 今日の失敗/未表示時は先読みゼロ、成功後のみ翌日1件。先読み失敗は画面非ブロック・即時再試行なし。停止時の中継は上流取得ゼロ、通常本文は取得可能、旧today応答との互換確認。日次選定・IDリストを変更しない。

- [x] T007 [US1] 実行測定に基づくサイズ・同時数・全体期限を設定する — `L/packages/core/src/decompress.ts`、Workers content/control/env/config、`D/src/lib/libroaozora.ts` / `content-cache.ts`、`L/docs/investigations/official-origin-limits.md`（新規）、測定用スクリプト/テスト（新規）。
  **依存:** T005、T006。**作業:** 47927と789の実ZIPを固定し、出典/日時/ハッシュを記録。cold/KV/R2、metadata cold/warm、異作品並行、保存障害を計測。ZIP stream受信・展開出力の実バイト上限、isolate同時数・Map件数、Workers→Next→ブラウザ期限を設定。ローカル値と本番契約の実測値を分け、本番測定はT009の対象確認後に行う。
  **完了条件・検証:** 短編/長編の正常出力と境界値±1、Content-Length欠損/偽値、複数txt、巨大展開/中断/timeoutを検証。メモリ/CPU計測不能な値をwall timeで代用しない。ローカル合格と設定根拠を記録、本番適合はT009で閉じる。合理的な上限で既存作品を切り捨てる必要があれば、互換性判断を未解決として提示する。

- [x] T008 [US1] A/Bの統合検証とリリース資料を完成させる — 両repoのREADME、`L/docs/investigations/official-origin-release.md`（新規）、全関連テスト。
  **依存:** T007。**作業:** libro core build→全test/lint/Workers lint:test、dayro build/lint/test/型を実行。取得元ログ、cache供給元、fetch回数、同時要求数、put成功率、429/5xxを追えることを確認。設定表・固定ID疎通・保存停止時の先読み停止・復旧手順を記載。
  **完了条件・検証:** T002〜T007の証拠が揃う。ルート全モックだけで合格しない。両repo差分とフィクスチャをレビュー可能にし、C/D未完・未保存作品の公式停止時制約を明記する。

- [ ] T009 [US1] 先行リリースと本番疎通を行う — 両repoのデプロイ設定、T008のリリース記録。
  **依存:** T008、実装後の本番反映の取扱い確認。**作業:** 認証・契約枠・対象binding・lifecycle・既存metadata/代表ZIP・現デプロイSHAを確認。公式取得コードを反映し、47927/789固定で本文一致・再アクセスの保存利用・cold/R2/KVの性能を確認。cold/障害注入は専用検証bindingで行い、本番の全キャッシュを消さない。
  **完了条件・検証:** 正しい本文200、キャッシュ再利用、実行上限内、保存障害時200の検証環境証拠、先読み停止手順を記録。CPU/メモリ等に未確認が残れば「本番適合未確認」。復旧先は公式取得を維持する既知正常版で、到達不能なGitHub取得へ戻さない。

## US2 — 訂正を識別し、許可された旧版だけを使う（C）

- [x] T010 [US2] 本文更新情報・識別契約をcoreへ追加する — `L/packages/core/src/csv-parser.ts`、`types/index.ts`、版識別補助（新規候補）、`tests/csv-parser.test.ts`、識別テスト（新規）、`D/src/types/index.ts`の契約準備。
  **依存:** T008。**作業:** textSource、SHA-256 sourceRevision、decodeVersion/textHash/contentIdを実行設計どおり定義。CSVの本文専用2列を取り込み、欠損はnull、非空不正値/重複行の矛盾を検証対象にする。
  **完了条件・検証:** 同URLで日付/回数変更→版変更、同入力→同版、query/hostの違いを区別。空欄に現在日時を入れない。Work.updatedAtの意味と旧Work互換を維持、coreのNode/Workers両対応。実47927/789列値を小さなCSVフィクスチャに保存して回帰化。

- [x] T011 [US2] 同期の検証・snapshot公開を実装する — `L/packages/workers/scripts/sync-metadata.ts`、同期補助（新規候補）、`tests/scripts/sync-metadata.test.ts`（新規・Node用test configを分離）、`src/lib/constants.ts`。
  **依存:** T010。**作業:** download/validate/publish分離、公式CSV期限/上限・必須列/行/権利/参照検証、R2 snapshotとcurrent/previous、KV同世代保存を実装。初回legacy snapshotをpreviousへ収容。current更新者を同期に限定。
  **完了条件・検証:** fake storageで空/不正CSV・引用符欠損・権利列欠損・部分write・current切替失敗/応答喪失・再実行を検証し、正常pointerを失わない。KV失敗のみなら同世代R2で公開成功。人物の複数行/正常削除を受理。本文URLへのfetchはゼロ。更新情報込みJSON bytesを実測しKV上限内と記録。

- [x] T012 [US2] 単一世代readerとlegacy移行を実装する — `L/packages/workers/src/services/metadata.ts`、`routes/works.ts` / `persons.ts` / `health.ts`、`tests/services/metadata.test.ts`、ルート全テスト/seed。
  **依存:** T011。**作業:** current60秒、KV generation→同世代R2、previous明示fallback、snapshot shape/digest検証、読込み共有/メモリ保持上限を実装。current不存在のみlegacy R2を利用。health/statsへ世代・同期経過・fallback観測を追加。
  **完了条件・検証:** KV反映遅延・JSON不正・現snapshot喪失・pointer通信失敗・cold start・60秒境界を検証。全ルートで作品と人物を別世代から合成しない。R2通信例外で削除ゼロ。現metadataの作品不存在をpreviousで復活させない。legacyから新形式へ移行しても旧APIの必須形が維持される。

- [x] T013 [US2] 本文版別保存・条件付き競合処理を実装する — `L/packages/workers/src/services/content.ts` / `content-control.ts`、`tests/services/content*.test.ts`。
  **依存:** T010、T005。**作業:** v2キー/envelope/customMetadata、sourceRevision共有キー、R2条件付き新規保存/修復、同一版異ハッシュの保護・記録を実装。旧形式を現行hitとして使わない。
  **完了条件・検証:** 旧版処理が遅く完了しても新版キーを上書きしない。R2条件不成立nullと例外を区別。競合時に負けた本文をKVに上書きしない、同一版ZIP/本文不一致を検知・unverified化。R2/KV片方・両方保存障害で正常本文は返す。KV expiry→同版R2から復元。実workerdで条件付き操作を検証する。

- [x] T014 [US2] 旧版候補・取得エラーcode・同世代本文応答を実装する — `L/packages/workers/src/services/content.ts`、`routes/works.ts`、`errors.ts`、core型、関連テスト。
  **依存:** T012、T013。**作業:** 実行設計の最大4系統候補・エラー表・delivery・本文内workを実装。権利/存在/URL確認後に限り旧版へ進み、実際の本文ID/版を返す。
  **完了条件・検証:** 通信/timeout/429/5xx×旧版有無、403/404/410、URL削除、権利変更、作品削除、新ZIP破損、待機中を表形式で網羅。旧版を新キーに保存しない。metadata previous/legacy・競合をcurrent扱いしない。内部例外非公開、従来raw/plainとX-Cache-Status維持。

- [x] T015 [US2] 中継の世代統合・互換エラー・旧版no-storeを実装する — `D/src/lib/libroaozora.ts`、`src/types/index.ts`、`src/app/api/works/[id]/route.ts`、`src/__tests__/lib/libroaozora.test.ts` / `api/works-id.test.ts`、`L/packages/web/src/lib/api-client.ts`の互換検証。
  **依存:** T014。**作業:** 本文内workを使う1応答経路、旧上流のdetail補完、delivery/readingContentId伝達を実装。HTTP404/502とerror文字列は維持しcode/retryableを追加。stale/unverified/errorはCからno-store。
  **完了条件・検証:** metadata/detailと本文の世代不一致でも新本文内workで揃う。新版欠損/矛盾は安全なエラー、旧応答はunverified。例外文言を変えても分類が安定。新旧上流×新旧クライアントの契約fixture、実47927構造化が成功。libroデモwebを型/build互換で壊さない。

- [ ] T016 [US2] Cの移行・競合統合試験と復旧手順を完成させる — 両repo関連テスト、`L/docs/investigations/official-origin-release.md`。
  **依存:** T015。**作業:** legacy seed→新reader→初回snapshot→同URL更新→次アクセス→公式一時停止→旧版→復旧を統合。同期中リクエスト・後着旧処理・current切替失敗をbarrierで再現。新metadata量込みCPU/メモリを再測定。
  **完了条件・検証:** 全関連test/lint/型/build成功、本文全件再取得/全削除/バケット一覧走査なし。snapshotの現・直前を保持し、v2 readerを維持したpointer復旧手順を試験。未保存の古い版を探せない制約を記録。

- [ ] T017 [US2] reader先行・手動同期・日次同期を順に公開する — `L/.github/workflows/sync-metadata.yml`、`L/README.md`、両repoデプロイ設定、リリース記録。
  **依存:** T016、T009、対象・差分の本番反映確認。**作業:** 新旧reader互換コードを先に公開→writerと直列workflow→手動同期成功→中継新契約→日次scheduleの順で有効化。初期cronは毎日03:00 UTC（12:00 JST）とし、手動も同じgroup、cancel-in-progress=false。直接remote同期の旧手順を廃止する。
  **完了条件・検証:** 現/直前世代・同期件数/時刻・同期エラーが観測可能。手動と定期競合で世代逆転なし。本文アクセス時のみv2保存、Cの旧版no-storeを本番確認。公式取得を残したv2互換コードと正常pointerへ復旧できる。

## US3 — 開くときに訂正を確認し、読書位置を守る（D）

- [x] T018 [US3] IndexedDB移行と開くときの再検証を実装する — `D/src/lib/content-cache.ts`、`src/types/index.ts`、`src/__tests__/lib/content-cache.test.ts`。
  **依存:** T015。**作業:** v2読取互換/v3書込、checkedAt/delivery/readingContentId、24h判定、offline/一時失敗fallback、停止検知時無効化、取得共有を実装。transaction完了/abortを扱う。
  **完了条件・検証:** fake-indexeddb+仮想時計でv2移行、checkedAt欠損、24h境界、毎日の閲覧で確認期限を延ばさないこと、CDNの古いvalidatedAt、旧版/metadata fallback/通信失敗でcheckedAtを進めないことを検証。明示停止後offlineで旧本文を復活させない。破損blocks/QuotaExceeded/IDB無効でも適切に取得本文を提供。

- [x] T019 [US3] 今日・本棚の位置を本文識別子と対応させる — `D/src/lib/reading-state.ts` / `bookshelf.ts`、`src/hooks/useReadingState.ts`、`src/types/index.ts`、関連lib/hookテスト。
  **依存:** T018。**作業:** 全位置保存・再開経路にreadingContentIdを追加し、一致しない/新本文に対して旧位置ID不明の場合は位置のみリセット。お気に入り/読了履歴/累積記録と読書セッションのcompletedを分離して維持する。
  **完了条件・検証:** 今日/本棚、favorite/completed/favorite_completed、旧localStorage、同本文/別本文、構造版のみ変更を検証。古い文番号を別版へ適用しない。beforeunload保存でも本文IDが落ちず、履歴・streak・累積値を消さない。

- [x] T020 [US3] 表示開始前の切替・通知・読書中固定を統合する — `D/src/components/reading/ReadingClient.tsx` / `ReadingView.tsx`、`src/lib/content-cache.ts`、読み込みUI、コンポーネントテスト（新規）。
  **依存:** T019、T006。**作業:** 今日/本棚で再検証完了後に表示データと位置を選択、更新時に短い先頭再開通知。表示中の本文を固定し、先読みも新共通キャッシュ経路へ寄せる。
  **完了条件・検証:** 表示前新版→リセット、offline旧版表示中に新版到着→差し替えなし、次の開き直し→新版。本文/位置/通知の整合を確認。今日表示成功後の明日1件、失敗非反復、停止設定を再検証。本文取得期限が実際のloading全体に効く。

- [x] T021 [US3] 正常CDN方針と検証日時の伝達を完成させる — `D/src/app/api/works/[id]/route.ts`、`src/lib/libroaozora.ts` / `content-cache.ts`、APIテスト、両repo運用文書。
  **依存:** T018、T015。**作業:** 正常応答を1h、24h SWRを削除。stale/unverified/errorのno-storeを維持。Next側fetchとブラウザfetchのcache設定を明示し、delivery時刻をそのまま伝達。旧CDNオブジェクトの失効手順を具体化。
  **完了条件・検証:** 正常/旧版/未検証/エラーのheaderを比較。CDN hitをブラウザの現在時刻の検証成功にしない。todayの日付キャッシュは維持。既存CDNの失効方式/待機条件を環境に合わせて記録。

- [x] T022 [US3] 訂正・停止・位置移行を全層で検証する — 両repo統合fixture/テスト、`L/docs/investigations/official-origin-release.md`、Dのコンポーネントテスト/ブラウザ検証記録。
  **依存:** T020、T021。**作業:** 公式CSV更新をfixtureで投入し、snapshot→版cache→中継→IDB→表示を検証。仮想時計で日次同期・current60秒・CDN1h・checkedAt24hの重なり、同期停止、提供停止を確認。実ブラウザで本棚/今日・offline・開き直しを確認する。
  **完了条件・検証:** 閲覧した作品だけ次アクセスで更新、読書中不変、旧版非誤認、位置リセットと履歴保持が一連で成功。全test/lint/型/build成功。実ブラウザ検証の方法と結果を記録し、厳密な反映SLAや未閲覧/offline端末の即時更新を保証しない。

- [ ] T023 [US3] D公開と全体完了記録を行う — 両repoREADME/デプロイ設定、本書、リリース記録。
  **依存:** T022、T017、対象・差分の本番反映確認。**作業:** C契約の利用可能性を確認してDを公開。旧CDN失効/失効待ちを実施し、47927/789、再アクセス、IDB移行・本棚再開を確認。合意済み設定表と制約・監視/復旧方法を最終文書へ反映。
  **完了条件・検証:** A/B/C/Dすべての受け入れ証拠と本番疎通を記録。旧形式保存の一括削除なし、本文全件同期なし、公式取得維持の復旧先あり。この時点で初めて「訂正の画面反映まで完了」と報告する。

## 保留の管理

| 残る事項 | 解消タスク | 判断基準 |
| --- | --- | --- |
| ZIP/展開bytes・同時数・Map件数・全体期限 | T007、T009 | 47927/789・並行処理の実測と本番契約枠。値を未測定のまま本番適合済みにしない |
| 本番認証・binding・SHA・lifecycle・権限 | T009 | 読取り調査で特定し、反映対象と差分を明示する |
| v2 metadataの容量・CPU/メモリ | T011、T016 | 新フィールド込み実測、KV上限と実行枠の両方に適合 |
| 条件付きR2の実ランタイム挙動 | T013 | 条件不成立null、同一版異内容、破損修復の競合試験 |
| CDN旧header失効と全層疎通 | T021〜T023 | 本番環境の失効手段/待機を記録して確認 |

これらは実装・運用時の検証事項で、Step 1完了を妨げる仕様質問ではない。測定結果が課金・既存提供範囲・新基盤の選択を大きく変える場合は、その箇所だけ根拠と代替案を添えてユーザー判断へ戻す。

## Step 2進捗（2026-09-06 JST）

| タスク | 状態と証拠 |
| --- | --- |
| T001〜T008 | A/Bのローカル実装・検証済み。先行候補archiveを固定してからCへ進行 |
| T009 | 未完。本番認証・binding・契約枠・CPU/isolate peak memoryと公開承認待ち |
| T010〜T015 | Cのローカル実装・検証済み。公式全CSV検証、実workerd条件付き保存、移行/競合/同世代応答、C中継単独候補の164 tests/build成功 |
| T016 | 統合試験と復旧手順は完成。新metadata量・経過時間を再測定済みだがCPU/isolate peak memory未測定のためチェックは未完のまま |
| T017 | reader→手動writer→中継→日次の公開手順を準備。本番未実施。writer gate未設定、cronは手動成功まで無効 |
| T018〜T022 | Dのローカル実装・検証済み。181 tests、lint/type/build、全層実ブラウザ7シナリオ成功。T021は新deployment切替/purge/待機手順を文書化し、実環境の対象確定と実行はT023へ残す |
| T023 | 未完。本番D公開・CDN切替/失効確認・本番全層疎通待ち |

チェック済みはローカル変更と検証を示し、本番完了を意味しない。T016の実行枠確認を未完のまま、独立に実施可能なDのローカル作業を継続した。公開時はT009→T016受入れ→T017→T023の依存を守る。

証拠は `L/docs/official-origin/step2-log.md`、`L/docs/investigations/official-origin-release.md`（A/B）、`L/docs/investigations/official-origin-cd-release.md`（C/D）、`L/docs/investigations/official-origin-browser/README.md`。GitHub認証/Production履歴は読めたがCloudflare直接認証・workflow repository secrets/variablesは未設定。未保存の過去版、同期停止、未閲覧/offline端末への即時更新は保証しない。

PR #8レビュー追補: T011/T012/T013/T014/T016の移行マーカー・復旧参照制限・旧本文共有を修正し、core61/Workers131/Node8、lint/type/build成功。初回pointer失敗時の復旧と旧C/D archiveの失効をリリース資料へ追記。本番前提の未完状態は変わらない。

PR #8再レビュー追補: T012/T016の初回公開直後の境界を修正。不存在cacheとマーカーが食い違う要求内でcurrentを1回再取得し、1秒後の公開完了を最初の1件/16件で処理。計205 tests、lint/type/build成功。本番前提は引き続き未完。
