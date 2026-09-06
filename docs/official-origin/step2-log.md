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

## PR #7レビュー対応: 共有タスクの寿命

共有処理の作成元でcleanupを含むPromiseをwaitUntilへ登録し、期限と後続要求による回収・旧タスクの解放競合防止を追加。core59/Workers111・型/lint/dry-run、実HTTP切断18シナリオを確認した。対照実行では所有I/Oコンテキスト破棄を再現できていないため、動作確認と元不具合の再現を区別して [検証記録](../investigations/pr7-request-lifecycle.md) に残した。
