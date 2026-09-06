# A/Bローカル測定と暫定上限

2026-09-06 JST。本番契約・CPU・isolateピークメモリは未確認。

| 作品 | ZIP bytes | 展開bytes | raw UTF-8 bytes | ZIP SHA-256 |
| --- | ---: | ---: | ---: | --- |
| 47927 | 2,485 | 4,205 | 6,258 | 86922208e2107d0a98cc08a37d907e2bf5a1efa1948a9ebbede25a9b60d44e20 |
| 789 | 344,964 | 749,051 | 1,120,767 | 6545750b89ee2c57f215a65079eeab56ee7c997373b7b86e5b00ae74fe69208f |

47927は開始時実ZIP fixtureを維持。789は2026-09-06 JSTに `https://www.aozora.gr.jp/cards/000148/files/789_ruby_5639.zip` を1回取得し固定。全件本文取得なし。

11,309,473 bytesのmetadata（17,840作品・1,335人物）をローカルworkerdの使い捨てKV/R2へ投入。本文originは上記実ZIPの固定応答で、ネットワーク遅延を測った値ではない。

| シナリオ | 47927 ms | 789 ms | 2作品のorigin取得回数 |
| --- | ---: | ---: | ---: |
| 本文cold（最初はmetadataもcold） | 359.5 | 263.9 | 2 |
| KV hit / metadata warm | 73.1 | 116.9 | 0 |
| R2 hit / metadata warm | 63.1 | 172.2 | 0 |
| 異作品同時cold / metadata cold | 351.4 | 476.5 | 2 |

この測定は初回B実装に対するもの。最終コードで再測定し差分を追記する。障害注入はworkerdのcache-failures.testでKV/R2 read/body/put・両putを検証し、200・fetch1回・delete0を確認。

Node補助測定のCPU/RSSはNodeプロセスの値。CSV解析は同期ジョブ相当であり本文WorkerのJSON解析とは違う。CSV解析を含むプロセスpeak RSS 542,332KiBをWorkersのisolate使用量と誤記しない。Workers CPU/isolate peak memoryは未計測。

| 設定 | A/B初期値 | 根拠・留保 |
| --- | --- | --- |
| CONTENT_MAX_ZIP_BYTES | 8MiB | 789の約24倍。実受信bytesで制限 |
| CONTENT_MAX_OUTPUT_BYTES | 16MiB | 789の約22倍。matching txt全体の実出力で制限 |
| CONTENT_MAX_CONCURRENT | 2 | 異作品同時coldをローカル検証。activeを追出さず超過をエラー化 |
| CONTENT_COOLDOWN_ENTRIES | 256 | active=2×60秒の待機を保持する初期運用枠。期限切れ清掃＋古い待機のみ追出し |
| CONTENT_TIMEOUT_MS | 20,000 | 内容取得全体。公式10秒、各cache操作最大3秒で正常本文の保存失敗を許容 |
| metadata期限 | 最大5秒 | KV/get/body各1.5秒、書戻し0.5秒。読込中共有 |
| Next上流 | 30秒 | metadata 5秒＋content 20秒より余裕 |
| ブラウザ本文全体 | 40秒 | Next上流30秒＋IDB等の余裕。期限でfetchをabort。保存待ち中なら取得済み本文を返す |

これらは代表作品でのローカル合格値で、全作品サイズ分布や本番CPU/メモリ適合の保証ではない。制限にかかった既存作品を観測した場合は互換性判断を行い、無断の提供範囲縮小・課金変更で解決しない。

再現: core build、Workers `wrangler deploy --dry-run --outdir /tmp/official-origin-step2/worker` 後、`node scripts/measure-worker.mjs /tmp/official-origin-step2/worker/index.js /tmp/aozora-investigation/official-metadata.zip`。使い捨てローカルbindingのみ。Node補助は `scripts/measure-content.mjs`。

仕様参照: [fflate streaming ZIP](https://github.com/101arrowz/fflate)、[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)。公式の許容レートを上限の根拠にしていない。

最終A/B（CRC/metadata読込共有追加後）の再測定: cold 582.95/434.55ms、KV 102.63/152.87ms、R2 78.41/213.66ms、同時cold 407.82/555.74ms（47927/789）。全て200、cold時各1fetch、KV/R2時0fetch。ログ `worker-measure-final.json`。CPU/ピークメモリは引き続き未計測。

## C最終の全metadata測定

`measure-worker.mjs --v2` の最終結果は [JSON](./official-origin-workerd.json)。新strict parserのdata JSONは12,343,398 bytes、測定用schema/generation付きsnapshotは12,343,481 bytes、17,840作品/1,335人物。本文originは保存済みの実ZIP fixtureであり、公式ネットワークの速度測定ではない。

| 経路 | 47927 wall ms | 789 wall ms | origin fetch数 |
| --- | ---: | ---: | ---: |
| cold | 218.26 | 177.00 | 各1 |
| KV | 5.07 | 62.92 | 0 |
| R2 | 8.76 | 121.74 | 0 |
| 異作品同時cold | 15.02 | 132.45 | 各1 |

すべて200、本文UTF-8は6,258/1,120,767 bytes。A/Bとはmetadata保持・版キャッシュ実装とwarm状態が異なるため、この一回の測定を厳密な性能改善率として扱わない。CPU時間・isolateピークメモリは未計測。全CSVをNodeでparseするwriterのRSSとWorkerがsnapshotを読むメモリは別である。本番契約枠への適合はT009/T016で確認する。
