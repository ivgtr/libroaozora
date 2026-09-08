# 公式ZIP取得のUser-Agent修正と本番復旧

2026-09-08 JST。ユーザー承認に基づく本対応。本文の取得方式・保存形式・期限・エラー分類・metadata同期は変更していない。

## 原因を絞った比較

同じCloudflare accountの一時Workerで、公式47927 ZIPへのGETをredirect=manualで2条件比較した。

| 条件 | 結果 |
|---|---|
| 明示ヘッダーなし | 93msで302、`http://mirror.aozora.gr.jp/cards/001030/files/47927_txt_51147.zip` へ転送 |
| User-Agentのみ明示 | 8msで200、2485 bytes、公式fixtureとSHA-256一致 |

User-Agentは `libroaozora/0.1 (+https://lb-api.ivgtr.me)`。ブラウザを偽装していない。
ローカルworkerdでは302を自動追従すると約10秒のTimeoutErrorを再現し、User-Agentのみ追加すると200となった。curlからUser-Agentだけを外しても同じ302となった。
[公式FAQ](https://www.aozora.gr.jp/guide/aozora_bunko_faq.html)はmirrorの休止を明記している。

過去ログのheaders段階は自動リダイレクト先での待機を含み、最初の公式ホストが無応答だったことを意味しない。AcceptとAccept-Encoding: identityの同時指定は改善せず、本対応では採用しない。
一時Worker `libroaozora-origin-probe-20260908` は比較後に削除し、Wranglerで不存在を確認。一時secretファイルも削除した。

## 実装と検証

`fetchSource()` の公式取得にサービスのUser-Agentを明示した。新旧本文経路で共通の取得関数を使用する。対応テストで公式URLへこのヘッダーを付けて1回取得することを確認する。
Workers 152件・Node同期8件、Workers本体・tests・scriptsの型チェック、本番configでのdeploy --dry-run --keep-varsが成功。
最初のWorkers実行はログ出力先がread-onlyという診断を出したが152件成功。WRANGLER_LOG_PATHを/tmpへ指定して再実行し、同じ152件を診断なしで通過した。

## 本番公開

- ソースcommit: `8afed50`（公式取得User-Agentと対応テスト）
- Worker: `libroaozora` / `lb-api.ivgtr.me`
- 公開日時: 2026-09-08T02:53:17.033Z（11:53 JST）
- version: `cd9cbe43-a46d-4077-8133-4038f34bdd8a`、100%配信をWranglerで確認
- compatibility_date: `2026-01-01`
- binding: 既存KVとR2 `libroaozora-data` を維持、`--keep-vars`で公開
- 復旧先: `82f17160-70d9-4949-85ac-31982eac8c71`。戻すとUser-Agentなしの取得障害も戻るため恒久対応ではない。

Cloudflareの認証・管理操作は、親作業ルートの共通手順どおり `packages/workers` から `node node_modules/wrangler/bin/wrangler.js` を実行する既定OAuth経路に固定した。認証ファイルの直接読取りや独自管理API呼出しは使っていない。

## 本番疎通結果

| 対象 | 結果 |
|---|---|
| 47927 raw初回 | 200 / MISS / 2.018秒、fixtureと本文一致 |
| 47927 raw再要求 | 200 / HIT / 0.734秒、同じ本文 |
| 47927 R2読戻し | 2485 bytes、CRC正常、公式ZIPハッシュ一致 |
| 789 raw初回 | 200 / MISS、公式取得200、fixtureと本文ハッシュ一致 |
| 789 raw再要求 | 200 / HIT / 0.915秒、同じ本文 |
| dayro `/api/works/47927` | 200 / 2.821秒、9ブロック・1909文字 |

47927のtailで公式200→v2-r2-write成功→v2-kv-write成功を確認し、再要求ではorigin取得ログなし・cacheHit=trueだった。
R2の `content/v2/047927/86dcbd6e49cd56a80cfa8f877a5198dec6d9d48f595eee1d4b9774f538d89757.zip` をWranglerのremote GETで読み戻した。
ZIP SHA-256: `86922208e2107d0a98cc08a37d907e2bf5a1efa1948a9ebbede25a9b60d44e20`。
本文SHA-256: `106f5cf8012db89a98cc519937848c2833d29b569483ce6b65225101e03eac15`。

789は公式200・R2保存成功後にKV保存の期限超過を1回記録したが、正常本文を200で返した。後続要求はHITで本文ハッシュも一致。後続HITがKVかR2かはこのログだけでは区別しない。保存障害によって正常本文を失わない経路が本番でも動いた。継続的なKV障害かどうかは未評価。

## 残る事項

本番metadataは引き続きlegacy（同期日時2026-04-01）であり、libro本文応答は `verification=unverified` / `no-store`。今回の本文取得復旧は最新メタデータ・訂正反映の完了を意味しない。
本番dayroの応答は今回もdeliveryなしの旧契約だった。本文取得・構造化の復旧は確認したが、ローカル実装済みの版情報伝達・再検証仕様の本番反映は今回の範囲に含めていない。
metadata同期・writer有効化・全件本文取得・dayroのコード変更やデプロイは実施していない。

HTTP結果・限定tail・R2読戻し・CLIログは `/tmp/aozora-origin-verification-20260908/`。tailは検証後に停止した。
