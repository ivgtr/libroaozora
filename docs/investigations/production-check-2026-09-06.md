# マージ後の本番疎通確認

2026-09-06 17:54–17:57 JST。公開GETによる確認。デプロイ、メタデータ同期、設定変更、キャッシュ削除は実施していない。GETによる通常のアプリ内キャッシュ保存は起こり得る。

## 公開状況

PR #8は08:51:31 UTCにmainへマージされ、merge SHAは `bbc49989a3c9d03fdc9854e31bc4943b595ff3cb`。GitHub deployment 6291064032は同SHAのVercel Production成功を報告している。これはCloudflare Workerの反映証拠ではない。

## 公開APIの結果

対象: `https://lb-api.ivgtr.me`。

| 経路 | HTTP | 確認結果 |
| --- | --- | --- |
| /v1/health | 200 | status=ok、17,802作品/1,334人物、最終同期2026-04-01T17:09:33.798Z。metadataGeneration/metadataStateなし |
| /v1/stats | 200 | 世代情報なし |
| /v1/works/047927 | 200 | 春浅き日に、権利消滅、公式ZIP URLあり、metadataGenerationなし |
| /v1/works/000789 | 200 | 吾輩は猫である、metadataGenerationなし |
| /v1/works/047927/content?format=raw | 500 | INTERNAL_ERROR |
| /v1/works/000789/content?format=raw | 200 | workId/format/contentのみ。work/deliveryなし |
| /v1/works?limit=2 | 200 | 一覧応答。limitは未対応なので既定20件 |
| dayroaozora.vercel.app/api/works/47927 | 502 | Failed to fetch work data、Vercel MISS |

789のraw UTF-8 SHA-256は `8db20100f2244509b2ef13104691bb91650e98476bd5609f19e15ae91e79d143` で、公式ZIPから作成したfixtureのtextSha256と一致。healthは異なるqueryとCache-Control: no-cacheでも旧形式だった。

最初のPython urllib要求はCloudflare error code 1010/403で拒否されたため、通常のcurlによる結果を上表に採用した。権利制限によるAPI 403とは区別する。

## 判定と次の確認

新版readerならlegacy metadataでもhealthに世代/状態を、正常本文にwork/deliveryを返す。観測結果は旧API契約であり、PR #7/#8の本番反映成功とは判定できない。Workerの実デプロイSHAとdomain routeの対応確認が必要。47927の500の内部原因は公開応答だけでは未確定。

Wrangler認証は期限切れでrefreshできず、管理APIからdeployment/bindingを確認できない。ローカルwrangler.tomlのKV IDもプレースホルダー。認証復旧後、実account・Worker・KV/R2 binding・現version/復旧先を読み取り確認し、新readerの公開が未実施なら対象/差分/検証/復旧先を提示して確認後にデプロイする。同期はreader疎通後に別途扱う。

HTTP body/headersと実行ログ: `/tmp/official-origin-production/`。トークンや秘密値は記録していない。

## 公開準備（ユーザーのログイン待ち）

`/tmp/libroaozora-production` にorigin/mainのmerge SHA `bbc49989a3c9d03fdc9854e31bc4943b595ff3cb` をdetached worktreeとして取得。元のワークツリーと未コミットの調査記録は保持。PR #8検証済みheadとのpackages/package.json/lockfile差分なし。

frozen-lockfileで依存を導入し、core build、core61/Workers150/Node8テスト、Workers本体・scripts・tests型チェック、`wrangler deploy --dry-run --keep-vars`が成功。設定ファイルはexampleから作成した仮設定で、KV IDは未設定。本番bindingが正しいことをdry-runで確認したとは扱わない。

次はユーザー端末の `wrangler login` による認証復旧。その後account・domain route・本番binding・現versionと復旧先を読み取り確認して設定を具体化する。まだデプロイ・同期は実施していない。準備ログは `/tmp/official-origin-production/`。

## 認証後の本番設定確認・公開承認用差分

OAuth認証復旧を確認。account `c10c564e85ff8a61cf548916fe1249ea` のWorker `libroaozora` がcustom domain `lb-api.ivgtr.me`のproductionに接続されている。追加のzone routeはなし。workers.devとpreview URLは有効で、公開用ローカル設定に同じ値を明示。

実bindingはKV `858bc608ca7446649aa4475cff24982a`、R2 `libroaozora-data`。既存設定に変数bindingはなし。compatibility_dateは2026-01-01。取得した実設定を `/tmp/libroaozora-production/packages/workers/wrangler.toml`（ignored）へ反映し、同設定の `wrangler deploy --dry-run --keep-vars` 成功。契約変更やCPU上限引上げは行わない。本番CPU/isolateピークメモリは未測定。

最新deploymentは `f76c56a9-13e4-4e23-af2c-62a11c5beb12`（2026-04-02T18:21:48Z）、100%配信versionは `b366fb51-bebf-499f-967b-09df417f86d8`。version詳細とbinding一致を確認。

R2をremote GETし、metadata/current.jsonとmetadata/migrated.jsonは指定キー不存在、metadata/all.jsonは取得成功。旧metadataの実body 11,286,574 bytes、17,802作品/1,334人物を新readerのvalidateDataへ通し成功。SHA-256 `f6326fb350a5271ac44dfdc6ca126853c366177978687cd467520f6a90e248cf`。同期前legacy読取りが成立するデータであることを確認した（本番実行枠の適合を示すものではない）。

公開対象はmain `bbc49989a3c9d03fdc9854e31bc4943b595ff3cb`。差分は公式直接取得・共有処理寿命/保存期限・本文版/metadata世代reader、既存KV/R2/domainを維持。writer同期・日次有効化・既存cacheの一括変更は今回の公開に含めない。通常のGETが新しいv2本文cacheを作る可能性はある。

承認後は公開ディレクトリのWorkersで `pnpm exec wrangler deploy --keep-vars` を実行し、deployment/version/domain、healthのmetadataState、47927/789のraw本文/hash/work/delivery/no-storeを確認。同期前はlegacy/unverifiedを期待する。

復旧は同期を実行しておらずcurrent/migratedが依然不存在であることを再確認してから、同ディレクトリで `pnpm exec wrangler rollback b366fb51-bebf-499f-967b-09df417f86d8 --name libroaozora --message "Restore pre-migration reader"`。旧版の既知47927不具合も戻るため、恒久修正としては扱わない。metadata世代移行後はこの旧readerへの復旧を使わず、v2互換reader維持とpointer復旧の手順に従う。

現時点はユーザーの公開確認待ち。デプロイ・同期・本番設定変更は未実施。

## 承認後の本番公開結果

ユーザーの公開承認後、2026-09-06T09:05:10Zに `wrangler deploy --keep-vars` を実行して成功。公開version `044bc2a0-0cf7-4179-b7d4-e97f0a523a8d`、deployment `3f25fdca-3c46-4b90-a638-2e12b936275c`、100%配信を管理APIで確認。custom domainとworkers.devの公開成功を確認。main SHAは `bbc49989a3c9d03fdc9854e31bc4943b595ff3cb`。

| 公開後確認 | 結果 |
| --- | --- |
| health/stats | 200、metadataState=legacy、generation=legacy-f6326fb350a5271ac44dfdc6ca126853 |
| 47927 raw | 約10.9秒で503/SOURCE_TEMPORARY_ERROR、no-store。再要求でも503 |
| 789 raw | 約11.5秒で200、work/deliveryあり。verification=stale、sourceRevision=null、no-store、X-Cache-Status=HIT |
| 789本文hash | 公式fixtureのSHA-256と一致（公開前と同じ） |
| dayro 47927 | 502が継続 |

本番tailでも上記versionを確認。47927はstage=origin-fetchでtemporary errorとなり、その要求にはContent origin responseのログがない。約11.4秒、CPU191ms、outcome=ok、未捕捉exceptionsなし。観測した他要求のCPUは176–246ms。これは限定的な実行サンプルであり、CPU上限への適合やメモリピークを保証しない。

この端末から公式47927 ZIPはHTTP200/約0.14秒で取得でき、2,485 bytesが既存fixtureとbyte一致。Workerからの取得はHTTPステータス記録前に失敗しており、取得タイムアウトと整合するが、ログのError.message/causeがシリアライズされていないため、通信原因（DNS/TLS/接続/送信先制限など）の確定はできない。789は公式取得成功ではなく、保存済み旧版への限定fallbackで成功している。

判定: Worker公開と新版API契約の反映は成功。47927の本番復旧・公式直接取得成功は未達。旧版へのrollbackも47927の既知500へ戻るため、観測範囲で他経路の退行は確認できず、今回は新readerを維持した。新たなコード公開・タイムアウト変更・外部中継・R2手動投入はしていない。メタデータ同期・writer有効化も未実施。

実行ログ・HTTP結果は `/tmp/official-origin-production/`。tail接続は確認後に停止した。コミット用の記録には要求IP等を含むtailの生データを転載せず、stage/version/CPU/経過時間のみ記録した。次の調査対象はWorker→公式配布元の取得失敗と、内部例外のmessage/causeを失わない診断ログである。

## 公式取得の診断リリース準備

新規取得の挙動、保存形式、取得期限、同期設定を変えず、公式取得の失敗だけを構造化して記録する変更を準備した。応答ヘッダー待ちとZIP本文読込みを区別し、作品ID、公式ホスト名、経過時間、Abort状態、例外のname/message/causeを出力する。完全URL、本文、stack、利用者情報は出力しない。URLを含む例外messageは`[url]`へ置換し240文字で切る。

header-stageのネットワーク失敗とbody-stageのストリーム失敗をworkerdテストへ追加。既存の公開APIエラー契約、失敗後60秒のcooldown、HTTP status分類を維持する。公開時は現行v2 reader version `044bc2a0-0cf7-4179-b7d4-e97f0a523a8d`を復旧先とし、旧v1 readerへは戻さない。診断結果を得るまで、期限延長・再試行・外部中継・メタデータ同期は実施しない。

実装後の確認: Workers 152件、Node同期8件、Workers本体/test型チェック、dry-run成功。dry-runはローカルのplaceholder bindingを使うため、本番binding検証ではない。実公開時は確認済みのKV `858bc608ca7446649aa4475cff24982a`、R2 `libroaozora-data`、custom domain `lb-api.ivgtr.me`を明示したignored設定を使い、`--keep-vars`で既存の管理画面変数を維持する。
