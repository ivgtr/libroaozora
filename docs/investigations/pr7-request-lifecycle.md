# PR #7: 共有タスクとリクエスト寿命

対象はcodex/official-origin-fetch。共有Promiseの解放を先行クライアントのリクエスト寿命へ依存させていた指摘に対応した。本番操作は未実施。

## 修正

本文とmetadataの共有タスクを作成時にExecutionContext.waitUntilへ登録する。登録対象はfinallyによる解放まで含むPromiseで、レスポンス側も同じ処理をawaitする。KV/R2保存を非同期化したものではない。合流する要求にも登録するが、I/Oを所有する作成元での登録を省略しない。作品・人物・health/statsを含む全API経路でcontextを渡す。直接サービスを呼ぶ単体テストではcontext省略を許容する。

共有エントリには絶対期限を持たせ、タイマーだけでなく次の要求も期限切れを回収する。同一作品への再取得と、別作品に使う同時実行枠の両方が回復する。古いタスクのfinallyはエントリの同一性を確認し、後から作られたタスクを削除しない。

本文は設定された全体期限（既定20秒、共有タスクは最大25秒）、metadataは5秒で区切る。Workersの切断後waitUntil枠30秒より短くするため、従来のCONTENT_TIMEOUT_MSに25秒を超える値を指定しても共有処理は25秒で失敗する。既定値・取得回数・保存形式は変更しない。先行APIでは共有本文の期限切れも既存の内部エラー応答500を使い、後続PR #8の分類では再試行可能な503となる。

仕様根拠: [Cloudflare context / waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/)、[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)（2026-09-06確認）。waitUntil自体も無期限保持やCPU/メモリ枠超過からの保護ではないため、後続要求による回収を併用する。

## 検証

- core59 / Workers111 tests成功。workspace lint、Workers scripts・testsの型検証、core build、Wrangler dry-run成功。
- 新しい単体テストは作成元/合流元の登録、失敗時解放、タイマーを進めずDateだけを進めた期限切れ回収、旧タスクの遅い完了が新タスクを消さないことを確認する。metadataの共有枠も同じ条件で確認。
- `pnpm --filter @libroaozora/workers test:lifecycle` は、実APIと実KV/R2を使うローカルworkerdへNode HTTPの別ソケットから要求する。Miniflareの通常入口に加えて直接socketでも確認した。現在のスクリプトは直接socketを使用する。
- metadata KV / metadata R2 / metadata body / 本文KV / 本文R2 / 本文R2 body / 公式fetch / 公式body / 公式timeoutの9箇所をbarrierで停止する。合流元を先行切断の前/後に開始する2通り、計18シナリオを実施。先行TCP接続だけを閉じ、後続成功または期限内の既存エラー、再アクセス200、別作品用の枠回復200を確認した。[結果JSON](./pr7-request-lifecycle.json)
- Node側のGATEは読取り途中を制御する試験用アダプター。公開Workerに試験endpointやbindingは含まない。公式配布元や本番bindingへはアクセスしない。

### 再現証拠の限界

`test:lifecycle --without-retention` でwaitUntil登録だけを無効にした対照も、同じ18シナリオを完走した。このローカルworkerd経路ではクライアント切断に伴う所有I/Oコンテキスト破棄を再現できていない。したがってHTTP試験は「修正後の切断・再取得・回復の動作確認」であり、「元実装の本番ハングを再現して解消した」証拠ではない。timer/finallyが実行されない場合の残留エントリ回収は、別の仮想時計テストで検証した。

記録は/tmp/pr7-lifecycle。後続PR #8に既に存在するmetadata復旧・共有旧版取得の修正を保持して、この寿命管理を取り込む。
