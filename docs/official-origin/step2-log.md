# Step 2実装記録

2026-09-06 JST。正本は親 `docs/official-origin-plan.md`。本番操作は未実施。

## 開始時点（T001）

親と両repoにAGENTS.mdなし。両CLAUDE.md・README、親docs/READMEとplan/research/design/tasksを読了。存在しない`.docs`を推測で補わない。
HEAD: libro `279a453c39e92b9cb81b394a6f2a7c47bb757d59`、dayro `95d60bd41b8d8176eb8d80ed4db7933e6d9a299d`。
差分・全追跡/未追跡ファイルhashを `/tmp/official-origin-step2/before.json`、開始時patchを同ディレクトリに保存。

保持対象: libroのerrors.ts元例外ログ、47927調査・ZIP fixture・テスト、dayroのAPI元例外ログ・実本文構造化fixture/test。libro README/package.json/Workers package.json/pnpm-lock.yamlのWrangler 4.129.0・Workers Vitest更新を保持し、依存更新は追加していない。本文ミラーフォールバックだけを直接取得へ置換。

実行環境: Node 26.3.1、既存 `/tmp/aozora-npm-cache/_npx/179a5fd3f63fede5/node_modules/pnpm/bin/pnpm.cjs` のpnpm 10.33.0をPATH先頭へ置いた。dayroは `NODE_OPTIONS=--no-experimental-webstorage`。Wranglerログ先を `/tmp/official-origin-step2/` に指定（既定のホーム配下は書込不可）。

`wrangler whoami` は今回も未認証。設定のKV IDは `<YOUR_KV_NAMESPACE_ID>`。本番binding・契約・lifecycle・デプロイSHA・保存状態は未確認。ログイン、temporary preview account、リソース作成、remote sync、デプロイは実行していない。

## A/Bの判断と変更

- T002: 完全なmetadata URLへ1回fetch。CSV公式URLを副作用のないdownload関数へ分離。sync importはmainを実行しない。同期の公開形式はまだ旧形式。
- T003/T004: KV障害→R2、R2 get/body/decode障害→公式。保存の失敗を独立処理。通信・破損とも無条件deleteを廃止。正常メタデータが取れなければ503、権利確認は本文cacheより前。
- T005: env単位、作品ID+完全URLでPromise結果を共有。Response/streamを共有しない。成功/失敗で解放。60秒待機、429 Retry-After秒数/HTTP date、件数上限。待機中もKV/R2 hitを返す。内部SourceError分類のみで、公開codeはC待ち。
- T006: todayへoptional prefetchEnabled、PREFETCH_ENABLED=falseとprefetch=1を中継で確認して204/no-store。読書表示commit後に翌日だけ先読み。同日/ID失敗反復を抑止。通常取得と共有し、停止された先読みに参加した通常閲覧は通常要求として取得できる。
- T007: fflate streamingの1KiB入力チャンクで実展開bytesを確認。複数txtの出力合計に上限、最初の名前順txtのみ保持。directory/完了/size/CRCも検証。不正ZIPを保存しない。Stream受信で実bytes上限、abort時cancel。巨大メタデータ同時parseを避けるため読込み中Promiseを共有（世代スナップショット化はC）。
- 資料のlegacy R2 `metadata.json` 記載は実コードと不一致。実キー `metadata/all.json` を維持し、Cの移行候補にもこれを使う。新形式で旧キー名を変更したとは扱わない。
- サイズ/期限は設定可能なローカル検証用初期値。本番プラン変更・全件本文取得・既存cache削除は行わない。

## 検証証拠

A単独変更後Workers 82件成功。Bの障害注入追加後101件成功、境界/timeout追加後106件成功。日次選定リストは変更していない。dayro既存151件＋停止/反復/表示テストで156件成功。最終一括結果はリリース記録に記載。

代表作品47927/789は公式由来の実ZIPをdecode→raw/plain routeへ通す。dayro既存47927 fixtureを実構造化へ通す。新789 fixtureはURL・取得日時・ZIP/text SHA-256を含み、ZIPだけをbase64保存する。

全metadata 17,840作品/1,335人物/11,309,473 bytesでローカルworkerd測定。cold/KV/R2/異作品同時cold、全て200。cache hit時origin fetchは0。詳細は `../investigations/official-origin-limits.md`。CPU・isolateピークメモリ未計測を経過時間で代用しない。

ログ `/tmp/official-origin-step2/`。dayro buildは成功しmetadataBase未設定の警告あり。導入時期の帰属比較は実施していない。

## Cの判断と変更（T010〜T016、T017準備）

- `textSource`を互換的に追加。完全URL・本文日付・修正回数のsourceRevisionと、デコード後raw hashのcontentIdを分離した。日付欠損を実行日時で埋めない。公式CSVの-1（4作品5行）は欠損とは別の版入力として保持し、その他の負数・不正値は拒否。「その他」role6行は既存coreの扱いを保つ。詳細は実行設計へ反映。
- writerは取得/strict検証/保存公開を分離。作品/人物の重複整合、列・行・権利・URL・参照を公開前に確認。immutable snapshotを保存してdigestを読戻し、同世代KV、current/previousの順で公開する。初回legacyをpreviousへ収容。公開直前にpointerを再確認し、同期時刻の逆転を拒否。書込みack喪失は読戻して成否を判定する。
- readerはcurrentを60秒確認し、世代KV→同世代R2→明示previous。一時的なpointer障害で既知世代を返す場合はunverifiedとする。legacyはcurrent不存在が確認できる場合だけ。世代と読込みPromiseを共有し保持数を制限する。health/statsに世代・同期時刻を出す。
- 本文は版別envelope/KVとZIP/R2を使用。ハッシュとcustomMetadataを検証し、新規はETag条件付き、破損修復は読めた対象のETag条件付き。R2本文の通信失敗では修復ETagを採用しない。条件不成立nullを保存例外と分けて勝者を読戻し、同一版異ハッシュを上書きせずunverifiedにする。KV/R2片方の保存失敗でも正常本文を返す。
- 旧版探索は一時障害に限定し最大4系統。作品存在・権利・現URLの確認を先に行う。作品削除/提供停止/破損ZIPを旧版で隠さない。旧版を新キーへコピーせず、実際のcontentId/sourceRevisionを伝える。
- 本文APIに同じsnapshot由来のwork/deliveryを追加。dayroはこの1応答を使い、旧上流だけdetailで補完してunverifiedとする。code/retryableを追加しHTTP404/502の互換を保つ。旧版・未検証・エラーはCからno-store。
- writerはGitHub Actions/default branch/明示variableでgateし、手動と定期を同じgroupで直列化。直接remote同期のREADME手順を廃止。reader先行と手動成功前に日次公開しないよう、03:00 UTCのcronはコメントで準備した。本番secret/variable設定、手動実行、cron有効化はT017に残す。

公式CSV全17,840作品/1,335人物を新strict validatorへ通して成功。data JSON 12,343,398 bytes、測定snapshot 12,343,481 bytes。workerdでcold/KV/R2/同時coldすべて200、hit時origin0。CPU/isolateピークメモリは未測定でT016はチェック未完のまま。本番前提に依存しないDのローカル実装へ進んだ。

C中継だけをA/B候補から再構成し、164 tests・type/lint・webpack buildで検証した。実ワークツリーのTurbopack buildは成功しているが、切り出し先のnode_modules symlinkはTurbopackのroot制限で拒否されたためwebpackを使った。archive/hashはC/Dリリース資料に記載。

## Dの判断と変更（T018〜T022、T023準備）

- IndexedDB DB_VERSIONは1のまま、旧v2読取/v3保存。checkedAtはcurrent deliveryのサーバーvalidatedAtだけから採用し、CDN受信時刻や閲覧で進めない。24h境界・将来日時・旧版/未検証・offline/一時障害を区別する。lastAccessedAtは容量整理用に独立させた。
- 明示停止は本文IDBを無効化し、localStorage停止マーカーも保持してモジュール再読込み/offlineで復活させない。履歴・本棚は削除しない。識別済みcurrentの正常応答が得られた場合だけ再利用を許す。
- 通常取得と先読みを共有しつつ、先読み停止に参加した通常閲覧を再取得へ進める。40秒をIDBと保存込みの全読込みに適用。保存transaction完了を待ちabortを失敗扱いにし、保存遅延だけで取得済みの本文を失わない。
- readingContentIdはcontentIdに構造版を連結。今日・本棚・完了・beforeunloadを含む位置保存/再開で伝達。本文ID不一致/新しい識別済み本文に対して旧位置ID不明なら位置だけ先頭に戻し、お気に入り・読了履歴・streak・累積値を維持する。旧本文も位置もID不明なoffline互換では旧位置を保つ。
- 表示前に本文/位置を決めて短い通知を出す。load sequenceで遅い過去要求を無視し、読書中に本文を置換しない。先読みは表示commit後のみ。正常CDNは1hにし24h SWRを削除。ブラウザ/API上流fetchはno-store。
- 実ブラウザでは元タイトルが本文の先頭に残る既存構造化を確認。パーサーの内容変更は今回行わず、検証の初期表示期待値を実データに合わせた。

## 最終ローカル検証と本番前提

| 検証 | 結果 |
| --- | --- |
| libro `pnpm -r test` | core61、Workers122、Node同期6成功 |
| libro `pnpm -r --parallel lint` / Workers `lint:test` | 全workspace・sync script・テスト型成功 |
| core build / libro web build / Wrangler dry-run | 成功。remote公開なし |
| dayro `pnpm test` / `pnpm lint` / `pnpm exec tsc --noEmit` / `pnpm build` | 181 tests・ESLint・TypeScript・production build成功 |
| 実CSVのstrict validation | 17,840作品/1,335人物成功 |
| 実ブラウザ | 7シナリオ成功、pageerror0。[方法・結果](../investigations/official-origin-browser/README.md) |
| 全層の時刻合成 | 仮想時計で日次sync・pointer60秒・CDN1h・ブラウザ24hを合成。古いvalidatedAtを受信時刻へ置換しない |

GitHub認証とrepository secrets/variables・Production deployment履歴を読取り確認した。repository secrets/variablesは空、Cloudflare直接認証は未完。履歴中のVercel成功SHAはWorkerの現SHAを証明しない。認証情報の値は出力していない。

[A/Bリリース](../investigations/official-origin-release.md) と [C/Dリリース・CDN切替・復旧](../investigations/official-origin-cd-release.md) に対象候補、差分、検証、復旧手順と未確定欄を集約した。T009/T016の実行枠、T017/T023の本番公開は未完。対象account/binding・現在SHA・契約枠を確定してから、本番設定/同期/デプロイ/purgeの具体的操作について承認を求める。本文全件取得、一括削除、デプロイ、remote同期は実施していない。

最終保持確認: 開始時に記録したpackage/lock・実fixture・47927調査ファイルはlibro7/7、dayro3/3でSHA-256一致。Workers package.jsonのdependencies/devDependenciesもA/B固定候補と一致（test script拡張だけは今回の変更）。保持結果は `/tmp/official-origin-step2/preservation.json`。両repoの `git diff --check` と資料内の相対リンク確認は成功。今回生成した非追跡tsbuildinfoを除去し、ローカル検証サーバーを終了した。commit/pushは未実施。

## PR作成

ユーザーの追加指示に基づき、先行API・先読み画面・世代API・中継・再検証画面を5本のドラフトPRへ分割してcommit/pushした。上記の「commit/push未実施」は実装終了時点の記録。PRと依存・追加した公開制御・確認結果は [PR一覧](./official-origin-prs.md) を参照。本番操作は引き続き未実施。
