# C/Dリリース準備・復旧手順

2026-09-06 JST。ローカル実装と統合検証済み。本番デプロイ・同期・設定変更・CDN purgeは未実施。正本は [計画](../official-origin/official-origin-plan.md)、判断と結果は [Step 2記録](../official-origin/step2-log.md)。

## 固定候補と公開順序

| 段階 | 候補 | 差分・検証 |
| --- | --- | --- |
| A/B | `/tmp/official-origin-step2/ab-candidate.tar.gz` | 公式取得・保存障害・負荷制御・先読み停止。C/Dなし。core59/Workers107/dayro157、lint/type/build/dry-run成功 |
| C reader/writer | 現libroワークツリー | snapshot世代、本文v2キー、権利確認、限定旧版、同世代work/delivery。core61/Workers122/Node6、lint/type/build/dry-run成功 |
| C中継 | `/tmp/official-origin-step2/c-relay-candidate.tar.gz` | A/Bへ新旧上流互換と旧版no-storeを追加。Dの位置/IDB移行なし。164 tests、lint/type/build成功 |
| D | 現dayroワークツリー | v2読取/v3保存、24h確認、位置対応、読書中固定、正常CDNのSWR削除。181 tests、lint/type/build、実ブラウザ7シナリオ成功 |

A/B SHA-256: `4a936f1553042595ebc7e09f3ce1aee9068b4796dd443bf92e64ae1a6dfc90a6`。
C中継 SHA-256: `891e10b5d9acc1555b50385684a60cbfc4b114afc1aa0820d9710d5546a8e909`。
各archiveは開始時の未コミット差分を含むソースで、.git・依存・ビルド出力・本番wrangler設定を含めない。C中継はA/B候補から互換変更を再構成して再検証した。外部node_modules symlinkによりTurbopackが拒否したため、この切り出しだけNext `build --webpack`を使用。実ワークツリーの通常production buildは成功している。候補を公開する前にcommit/SHAと実環境を対応させる。

1. T009: [A/B手順](./official-origin-release.md)で認証・binding・実行枠・専用検証環境を確認し、対象と復旧先を提示して承認後にA/Bを公開する。
2. T017: writerを無効のままC Worker readerを公開。legacy `metadata/all.json`だけでも作品/人物/本文APIが動くことを確認する。旧KV3キーを混ぜない。
3. account/KV/R2・権限を確認し、GitHub repository secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `KV_NAMESPACE_ID` を設定。variable `OFFICIAL_METADATA_WRITER_ENABLED=true` を設定して、default branchの `sync-metadata.yml` を手動実行する。これらも承認対象の本番設定・データ変更。
4. current/previous pointer、両snapshotのSHA-256、作品/人物件数、syncedAt、health/statsを確認。同期失敗ではcurrentが正常世代を指したままであることを確認する。本文全件取得や一括削除はしない。
5. C中継を公開し、47927/789のraw hash・work/deliveryの世代・旧版no-store・互換エラーを確認する。
6. 手動成功後にworkflowのschedule `0 3 * * *` を有効化。手動/定期は同じconcurrency group、cancel-in-progress=false。現在はscheduleをコメントアウトし、writer variableも未設定なので実行されない。
7. T023: C契約の本番利用を確認してDを公開。下記CDN切替を確認し、今日/本棚/IDB旧v2/開き直し/停止を確認して初めて全体完了とする。

## 読取り確認と残る前提

- Wranglerは未認証。ローカルKV IDは `<YOUR_KV_NAMESPACE_ID>`、bucket名は `libroaozora-data`。実account、Worker deployment SHA、binding、lifecycle、契約枠、CPU時間/isolateピークメモリは未確認。
- GitHub認証は有効。libroのrepository secret/variable一覧はともに空で、上記workflowの参照先は未設定。環境secretを設定する場合はworkflowのenvironment参照も必要であり、現状はrepository secretsを使う。
- GitHub Production deployment記録ではdayro `95d60bd41b8d8176eb8d80ed4db7933e6d9a299d` が2026-04-05に成功、libroデモweb `279a453c39e92b9cb81b394a6f2a7c47bb757d59` が2026-04-02に成功。これだけでは現在の独自ドメインのaliasやCloudflare Worker SHAを確定できない。
- libroの「Production – libroaozora-workers」にはVercelへの失敗記録もある。Cloudflareデプロイ記録として扱わない。ローカルのVercel project linkageもない。
- ローカルworkerdで実R2条件付き保存・条件不成立null・digest・移行・pointer復旧を試験済み。production REST adapterの認証/権限と実行枠への適合は未確認。全metadata量と経過時間は [測定記録](./official-origin-limits.md)。

## Dの旧CDN応答の切替

VercelのCDN keyにはdeployment URLも含まれる。別deploymentの新Dをproduction aliasへ昇格し、対象ドメインが新deploymentを指すことを確認する。旧deploymentを上書きしたという推定だけで確認を省かない。手動purgeはproject SettingsのCachesにあるCDN purge、または正しいteam/projectにlinkしたCLIの `vercel cache purge --type=cdn` で行える。[Vercel公式手順](https://vercel.com/docs/caching/cdn-cache/purge)、[CLI導入の公式記録](https://vercel.com/changelog/manually-purge-the-cdn-cache)（2026-09-06確認）。

承認時にteam/project ID、production domain、旧/新deployment ID、CDN purgeの対象範囲を記入する。既存応答に新しいcache tagはないため、新tagだけのinvalidateで旧オブジェクトが消えるとは扱わない。全project CDN purgeはtoday等もcoldになるので、必要な場合だけ影響を示して承認対象へ加える。R2/KV本文やIndexedDBの全件削除とは別操作である。

公開後は同じURLの `/api/works/47927` と `/api/works/789` を複数回読み、deployment、Age/X-Vercel-Cache、delivery.validatedAt/contentId/verificationを記録する。CDNがs-maxageをブラウザ応答から除く場合は配信設定とoriginログも確認する。正常1h・stale/unverified/error no-store、CDN hitでvalidatedAtが新しい現在時刻にならないことを確認する。

purge/新deploymentへの切替を確認できない場合、旧応答を最後に生成した時刻から旧max-age 1h + SWR 24h（計25h）を待機目安にする。ただし旧deploymentがまだ生成・配信中なら起算を確定できないため完了にしない。外部CDNが存在する場合は別途その経路の失効を確認する。ローカルではheaderと仮想時計の重なりを試験済みで、本番CDNのpurge・待機は未実施。

## 障害時の停止と復旧

1. 同期障害ではwriter variableをfalseにして新しい公開を止め、実行中workflowの終了を確認する。concurrencyは同workflowを直列化するが、外部writerに対する分散ロックではない。直接R2書込みと同期を並行させない。
2. 保存障害が継続する場合、dayro `PREFETCH_ENABLED=false` を反映して先読み204/no-storeを確認する。通常閲覧は継続する。
3. metadataに問題がある場合は、障害pointerを診断用に保存し、直前snapshotの実body/digest/schema/権利情報が復旧対象として適切か確認する。正常snapshotを削除しない。
4. 承認された復旧では、v2 readerと公式直接取得を維持したまま、正常referenceをcurrent、必要な正常直前referenceをpreviousとするpointer JSONだけを公開し読戻す。直列writer停止中に実施し、current最大60秒の保持後にhealth/作品/人物/本文を確認する。ローカルの `official-migration.test.ts` で正常pointerへの復旧を検証済み。削除された作品や権利停止を古いpointerで復活させないよう、復旧世代の内容確認は必須。
5. コード障害では専用bindingで疎通済みの公式取得・v2互換readerを復旧先にする。C以後に元HEADやA/B readerへ戻してsnapshotを無視させない。初回Cの既知正常deployment IDは本番前の専用環境検証で記入する。
6. dayroはC契約互換の修正版または検証済みC中継へ戻す。v3キャッシュ・読書履歴を一括削除しない。DからCに戻す間は24h再検証/位置対応の保証が止まることを記録し、D復旧後に確認する。

旧版候補は現/直前metadata由来の版・legacy pathname・旧KVの最大4系統のみ。未保存の過去版、過去の全世代、未閲覧/offline端末を探索・更新しない。同期停止中や公式の版情報が更新されない場合の厳密な訂正反映SLAは保証しない。

## 最終ソース保存

ローカルC/D候補を `/tmp/official-origin-step2/cd-candidate.tar.gz` に固定。SHA-256は `051222791978f0d3f9629f85b49025a96c34101064d1f2a4edf6d2aa0c316747`。このhashの追記直前の両repo追跡/未追跡・非ignoredソースを含む。Cでは同archiveのlibro部分とC中継単独archive、Dではdayro部分を使い、公開順序を崩さない。本番設定は含まない。
