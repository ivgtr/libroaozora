# Step 1 実行設計と判断

2026-09-06 JST。未実装。[合意済み計画](./official-origin-plan.md)を具体化する。
調査根拠は [調査記録](./official-origin-research.md)、依存・完了条件は [タスク一覧](./official-origin-tasks.md)。

## 段階と利用者の到達点

| ストーリー | 対応段階 | 到達点 |
| --- | --- | --- |
| US1 | A/B | 未保存作品を公式配布URLから読める。再アクセスはキャッシュを使い、保存障害だけで正常本文を失わない |
| US2 | C | 訂正を次の本文APIアクセスで扱い、一時障害では許可された正常旧版を明示して提供する |
| US3 | D | 次に開いた作品を期限に応じて再検証し、訂正・形式変更時には位置を安全にリセットする |

Aは単独レビュー・検証単位。先行リリースの完了単位はA/Bと実行上限確認であり、訂正の画面反映の完了ではない。C/Dの新型・新キーをA/Bの必須依存にしない。

## 本文の取得・保存

1. リクエストごとに一つのメタデータsnapshotを取得し、存在・権利・URLを確認する。この確認より先に本文キャッシュを返さない。
2. 当該版のKV→R2→メタデータに記載された配布URLの順。配布先へのfetchは1回、タイムアウト・サイズ上限を適用。失敗後の同一リクエスト内リトライはしない。
3. ZIPから対象txtを展開・Shift_JISデコードし、空白だけ、対象txtなし、明らかなエラーページ等を正常本文として保存しない。置換文字の全面禁止や文学本文の特定見出し必須化はしない。既存フィクスチャ・長編で基本検証を調整する。
4. 正常本文を得た後、R2保存→KV保存をそれぞれawaitして独立に処理する。片方の保存例外がもう片方を飛ばしたり200を失敗に変えたりしない。容量超過のKV保存もこの扱い。本文TTL30日、ZIPは期限なし。
5. R2読出し通信失敗と破損を分離。初期設計では破損時もリクエスト内で無条件deleteしない。A/Bの旧キーは正常再取得で置換可能、Cの版キーは破損オブジェクトのETagを使った条件付き修復。遅い削除で他リクエストの修復結果を消す競合を避ける。

KVはJSON envelopeのschema・workId・sourceRevision・本文ハッシュ等を確認し、不正はミスとして次層へ進む。legacyの文字列本文をv2 envelopeとして解釈しない。

### 重複抑制と負荷

実行環境内の共有Mapはenv/bindingごとに分離し、A/Bでは作品ID+完全URL、Cでは作品ID+sourceRevisionをキーにする。共有は取得・検証・保存結果の再利用可能なデータに限定し、Responseや消費済みstreamは共有しない。認可チェックは各呼出しで行う。

成功/失敗でfinally解放。一時障害待機は60秒、有効な429 Retry-After（秒数/HTTP-date）を尊重し、欠損・無効・過去日時は基本値へ戻す。Mapには期限・件数上限を持たせ、in-flightを単に追い出して重複fetchを発生させず、別作品の新規処理は上限到達時に再試行可能なエラーにする。待機中も正常KV/R2、Cでは許可された旧版候補を利用する。

測定表には47927/789のKV hit・R2 hit・cold、異なる作品の並行処理、metadata cold/warm、保存失敗を含める。CPU、ピークメモリ、ZIP/展開/JSON bytes、総応答時間、公式fetch回数を記録する。ZIP受信はstreamの累積バイト数、展開は出力チャンク累積で上限をかける。同期式unzip全体をPromise.raceに入れてもCPU/メモリ上限対策にはならない。

タイムアウトは公式10秒を起点に、metadata読出し・キャッシュ・保存も含むWorkers全体期限、Next上流期限、ブラウザ本文期限の順に余裕を設ける。サイズ・同時数・Map件数・期限の最終値は測定後の設定表に記録する。

先読み停止はdayroサーバー設定 `PREFETCH_ENABLED=false` を初期案とし、today応答に互換的な `prefetchEnabled` を追加、ブラウザで尊重する。today CDNの残存期間を待たず止められるよう、先読み本文要求に `prefetch=1` を付け中継でも設定を確認する。無効時は204/no-storeとし上流へ行かない。通常閲覧には影響させない。自動障害判定・管理画面は追加せず、保存失敗の継続をログから判断して運用者が設定を切り替える。

## データモデルと版識別

| データ | 具体形・意味 |
| --- | --- |
| Work追加情報 | `textSource: { updatedAt: string|null, revisionCount: number|null }`。旧Workでは省略を許容。`Work.updatedAt`の意味は変更しない |
| sourceRevision | UTF-8の `JSON.stringify(["aozora-source-v1", 完全URL, 正規化本文更新日またはnull, 非負整数修正回数またはnull])` のSHA-256小文字hex。trim以外にURLのquery/host/pathを捨てない |
| ZIP識別 | `zipHash` = 受信ZIP bytesのSHA-256。R2 customMetadataにsourceUrl、fetchedAt、sourceRevision、zipHash、textHash、decodeVersionを保持 |
| 本文識別 | `textHash` = デコード後raw文字列のUTF-8 SHA-256。改行等を勝手に正規化しない。`contentId`はdecodeVersionとtextHashから構成 |
| 表示位置識別 | dayroの `readingContentId` = contentId + `structureVersion`。structureVersionはdayro構造化・前処理・文分割・段落index規則をまとめた明示版。Workersに表示変換を持ち込まない |
| KV v2 | `content:v2:{workId}:{sourceRevision}` → 本文と上記情報のschema付きenvelope、30日 |
| R2 v2 | `content/v2/{workId}/{sourceRevision}.zip` → ZIP+customMetadata、期限なし |
| metadata snapshot | `{schemaVersion, generation, works, persons, syncedAt}`。generationは同期試行ごとに一意、JSON内容の検証用digestをcurrentに保持 |
| 公開pointer | R2 `metadata/current.json` → `{schemaVersion, current: {generation,digest}, previous: {generation,digest}|null}` |

欠損と不正を区別する。空欄はnull、非空の不正日付・不正回数や同一作品の矛盾する本文情報は同期検証で拒否する。本文URLがない作品はメタデータには存在可能、本文APIは従来どおり404。

同じsourceRevisionへの新規R2保存はIf-None-Match条件を利用し、競合なら既存データを再読して比較する。既存が正常でハッシュ一致なら採用し、その内容でKVを満たす。不一致なら正常な既存を保護し、競合した新データをKVへ上書きしない。実際に返す本文IDと `verification=unverified` を返し、no-store、異常ログ・再検証対象とする。ZIPだけ違い本文同一の場合もZIP差異をログへ残す。R2保存例外で比較不能の場合も成功本文は返し、独立KV保存は続けるが、版と内容の一致を分散的に保証したとは扱わない。次回R2で矛盾を観測したら同じ保護規則を使う。分散ロックなしで未観測の競合を完全防止する保証はしない。

R2 `put`の条件不成立は例外ではなくnullを返すため分岐が必要。[R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

## メタデータ同期・移行

同期のdownload/parse/validateとpublishを関数分離し、テストから実remote writeを呼ばない構造にする。UTF-8 ZIP/CSVの空・不正、必須header、列数/引用符、ID、権利値、作品/人物参照整合、重複行の矛盾を公開前に検証する。作品の複数著者行は許可し、必須情報を欠く行の黙示スキップで公開を成功にしない。件数減少は差分ログ・警告対象とし、正常な削除を固定閾値で無条件拒否しない。

公開順はR2 immutable snapshot保存・読戻し/digest検証→KV同世代snapshotのbest effort保存→R2 current切替。途中失敗はcurrentを変えない。KV失敗のみならR2で成立する公開を続け、警告を残す。current切替結果が不明なら読戻して判定し、同じジョブの再実行で旧世代を逆転させない。

current更新者は一つのworkflowに限定し、手動・定期を同じconcurrency group、cancel-in-progress=falseで直列化する。CLIの直接remote同期手順はworkflow dispatchへ置き換える。異なるbranchの古いwriterを手動実行して巻き戻さない運用を明記し、currentの世代/同期時刻による逆転検証も行う。

readerはcurrentを実行環境内60秒キャッシュし、その世代のKV→同世代R2を使用。作品・人物・同期時刻は常に同じsnapshotから返す。同じ世代の読込みも共有し巨大JSONを無制限に保持しない。現世代を読めない場合はpointerで既知のpreviousを試し、明示的にfallback状態を返す。current自体の通信失敗時は既知の最後の正常pointer/snapshotのみをfallback扱いで使用できる。cold startで参照先が全く不明なら503とし、バケット走査はしない。世代fallback時も同期経過時間だけで提供を自動停止しないが、確認済みとは扱わない。

初回のみ、currentが不存在と確認できた新readerは既存R2 `metadata.json`を一つのlegacy snapshotとして読む。旧KV3キーを合成しない。currentが壊れている/通信失敗の場合に「未移行」と推測してlegacyへ戻さない。初回writerは正常legacy snapshotもimmutable形式で保存しpreviousとして紐付ける。v2運用開始後は旧3キー・metadata.jsonを二重更新しない。

版不明の旧本文KV/R2を現行版hitとして昇格させない。アクセス時に公式を取得してv2へ保存。一時障害時の旧版候補はprevious snapshotの当該版、現在URLの旧pathnameキー、previous URLの旧pathnameキー、旧 `content:{id}` に限定して重複排除する（最大4系統、一覧走査なし）。旧ZIPは実展開・基本検証、旧KVは基本検証と本文ハッシュ計算を行う。識別子はlegacyの実本文に基づくものとし、sourceRevisionは不明ならnull。旧版を新キーへコピーしない。

KV値上限は25MiB、Workersのメモリ上限は128MB。追加後JSONが上限に収まることとCPU/メモリ適合は別々に確認する。本番プランを推定して課金変更しない。[KV limits](https://developers.cloudflare.com/kv/platform/limits/)、[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

## API契約とエラー

既存の成功フィールドを削除せず、Works詳細に `metadataGeneration`、本文応答に同じsnapshotから採った `work` と以下の `delivery` を追加する。

```ts
type Delivery = {
  metadataGeneration: string;
  metadataSyncedAt: string | null;
  metadataState: "current" | "previous" | "legacy";
  sourceRevision: string | null; // 実際の本文の版
  expectedSourceRevision: string | null; // 参照metadataが期待した版
  contentId: string;
  verification: "current" | "stale" | "unverified";
  validatedAt: string | null;
};
```

`current`は「直近に確認した現メタデータの版と正常本文が一致」。公式に毎回問い合わせた意味ではない。validatedAtはWorkersでcurrent pointerの確認が成功した時刻を上限とし、既存キャッシュを返すたび新しい日時を捏造しない。metadataStateがprevious/legacy、本文旧版、競合時はcurrentにしない。`fetchedAt`、`metadataSyncedAt`、`validatedAt`は別の時刻。

dayroは新応答では本文内workとdeliveryでtitle/authors/contentを一体取得する。既存の並列取得との移行時に世代不一致を観測しても本文応答内の同世代workを採用し、別世代のdetailを混ぜない。恒常的な2回fetchを廃止できる。旧上流がwork/deliveryを返さない時だけdetailを取得する互換経路を残し、unverified扱いにする。新本文内workのid/権利/世代矛盾は安全なエラーとし、世代を合わせるための無制限リトライはしない。dayroのWorkResponseにもdeliveryとreadingContentIdを追加する。

| 原因 | Workers code / HTTP | 旧版利用 | dayro HTTP / 追加code |
| --- | --- | --- | --- |
| 作品なし・本文URLなし | NOT_FOUND / 404 | 不可 | 従来404 / NOT_FOUND |
| 著作権制限 | FORBIDDEN / 403 | 不可 | 従来502を維持 / FORBIDDEN |
| 公式403/404/410 | SOURCE_UNAVAILABLE / 503 | 不可、保存物は削除しない | 502 / SOURCE_UNAVAILABLE、retryable=false |
| 通信・timeout・429・5xx | SOURCE_TEMPORARY_ERROR / 503 | 現metadataで提供可なら候補を試す | 候補なしなら502 / 同code、retryable=true |
| 新ZIP破損・上限違反 | SOURCE_INVALID_CONTENT / 502 | 不可、不正ZIPを保存しない | 502 / 同code、retryable=false |
| metadata全取得不能 | SERVICE_UNAVAILABLE / 503 | 許可情報がないのでサーバー本文提供不可 | 502 / 同code、retryable=true |
| 想定外の例外 | INTERNAL_ERROR / 500 | この例外を旧版成功で隠さない | 502 / 同code、retryable=false |
| 保存のみ失敗 | 正常200 | 取得済み本文を返す | 正常200 |

その他の公式4xxは取得障害・旧版不可として分類する。全て安定したcodeで扱い、文字列エラーメッセージ解析はしない。dayroの既存 `{error: string}` を維持し、`code`・`retryable`を追加するので既存404/502利用者の互換を維持できる。Aは既存エラー形式を維持し、B内部で分類、Cで公開契約化する。

現在の正常metadataで削除/権利/URL欠落を検知済みならprevious metadataからその作品を復活させない。公式停止statusはfetch時に初めて分かるため、同一版の正常cache hitのたび公式へ確認する仕様にはしない。

## ブラウザ・CDN・位置移行

`checkedAt`は最後に現行一致を確認できたサーバー時刻。ブラウザでHTTP200を受けた時刻とは別で、delivery.validatedAtより新しくしない。サーバーで生成された日時はCDN hitでもそのまま伝える。24時間判定はcheckedAtから行い、lastAccessedAtは30日削除判断にのみ使用する。旧応答・旧形式・metadata fallback・旧本文・通信失敗ではcheckedAtを進めない。再検証に使うfetchはブラウザHTTPキャッシュを再検証する設定を明示し、CDNの1時間は許容遅延として残す。

IDBは既存keyPathとindexが使えるため、フィールド追加だけならDB_VERSION=1を維持できる。CACHE_VERSION=3へ書込みを切り替え、読取りはv2も明示的に許容して未検証へ移行する。旧blocks JSONを検証して利用し、壊れたものだけミスへ。新フィールド欠損だけで削除しない。構造版と保存形式版は別管理にする。transaction完了まで成功を確定せず、abort/QuotaExceededでも表示可能な取得本文は返す。

オンラインかつ未検証/期限超過なら表示開始前に1回再検証。offline/通信障害/一時取得障害のみ正常なローカル本文を利用する。NOT_FOUND、FORBIDDEN、SOURCE_UNAVAILABLE、SOURCE_INVALID_CONTENTは古い本文で隠さない。提供停止はローカル本文を無効化/削除し次回offlineでも再利用しないが、本棚・読了履歴は保持。検知していない停止をoffline端末から回収する保証はしない。

表示が始まったらその読書セッションの本文とreadingContentIdを固定し、背景で取得した新版を注入しない。今日/本棚の開き直し時に、保存位置のreadingContentIdと比較。一致しない場合はprogress/viewPositionだけを先頭へ戻し短い通知を出す。旧位置IDが不明な場合も勝手に新本文へ結び付けずリセットする。新セッションのcompleted表示は再開位置と分離し、履歴・お気に入り・累積記録は保持する。旧ローカル本文だけで読む移行前データでは既存位置を保てるが、初めて識別可能な新版へ切り替える際に安全なリセットを行う。

先読みは今日の表示成功後、翌日1作品を通常取得と共有し、失敗をUIに伝播せず即時再試行もしない。同日・同IDのeffect再実行でも反復しない。保存済み先読みは従来どおり再利用でき、実際に開くときの24h再検証を省略しない。

Cからstale/unverified/error応答はno-store。Dで正常本文APIをs-maxage=3600へ変更し24h SWRを削除。既にCDNに保存された旧ヘッダーはコード変更だけで消えたと見なさず、対象キャッシュの失効または実環境で確認した失効待ちをリリース手順に含める。日次同期+current 60秒+CDN1時間+開くとき24時間の合成を仮想時計で検証し、厳密なSLAとはしない。

## 工数の再見積もり

1人で既存調査・テストを再利用する暫定値: A 0.5〜1日、B 2〜3日、C 4〜6日、D 3〜5日、段階別の統合検証・運用手順整理1〜2日、合計10.5〜17人日。各機能の単体テストは各段階に含む。本番認証待ち、契約判断待ち、リリース間の監視期間は含まない。Bの制限測定とCの条件付き保存検証で更新する。合意済み計画に記載された2〜4人日を全体見積もりとして用いない。
