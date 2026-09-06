# 作品 47927 の本文取得失敗の調査

調査日: 2026-09-06 JST（HTTP測定開始: 2026-09-05 19:02:08 UTC）。
調査時の checkout: dayroaozora `95d60bd41b8d8176eb8d80ed4db7933e6d9a299d`、
libroaozora `279a453c39e92b9cb81b394a6f2a7c47bb757d59`。
本番がこのコミットと同一かは未確認。

## 確認できたこと

対象作品の本番メタデータは200、本文は500、中継は502。
ローカルの dayroaozora を本番上流につないだ場合も502となり、元例外は
`libroaozora API error (content): 500`。本文のJSON解析・`parseStructured()` 前に失敗する。

メタデータの `sourceUrls.text` を現行コードで変換した
[GitHub ZIP](https://raw.githubusercontent.com/aozorabunko/aozorabunko/master/cards/001030/files/47927_txt_51147.zip)
は404。一方、[青空文庫の元ZIP](https://www.aozora.gr.jp/cards/001030/files/47927_txt_51147.zip)
は200で、`haru_asakihini.txt` を正常に展開・Shift_JISデコードできた。
[図書カード](https://www.aozora.gr.jp/cards/001030/card47927.html) も同じZIPを案内している。
GitHubリポジトリ自体の閲覧・contents APIも404だったが、非公開化・削除・移転等の理由は未確認。

**確定した不具合は、ミラーの404を回復できず、キャッシュから本文を返せない場合に
`origin-fetch` が例外となる取得経路。今回の本番500の直接例外がこれかどうかは未確定。**
本番KV/R2の状態や元例外は取得できていない。`wrangler whoami` は未認証。
本番の `kv-read` / `r2-read` で先に失敗している可能性は排除できず、
KV制限・障害やZIP破損を今回の原因とは断定しない。

## HTTP記録

1回目: 19:02:08 UTC開始。2回目と比較作品: 19:03:36 UTC開始。
ローカル中継のレスポンス時刻は `headers.json` の `local` を参照。
時間はcurlの `time_total`、単位は秒。

| 対象 | 1回目 status / 秒 | 2回目 status / 秒 | キャッシュ情報 |
| --- | --- | --- | --- |
| 上流 `/v1/works/047927` | 200 / 1.202 | 200 / 0.789 | X-Cache-Statusなし |
| 上流 `/v1/works/047927/content?format=raw` | 500 / 2.023 | 500 / 1.186 | X-Cache-Statusなし |
| 本番中継 `/api/works/47927` | 502 / 2.537 | 502 / 1.582 | X-Vercel-Cache: MISS |
| ローカル中継 `/api/works/47927` | 502 / 2.204 | — | 成功時キャッシュヘッダーなし |
| 比較: 上流 `/v1/works/000789` | 200 / 0.944 | — | X-Cache-Statusなし |
| 比較: 上流 `/v1/works/000789/content?format=raw` | 200 / 2.561 | — | X-Cache-Status: HIT |
| 比較: 本番中継 `/api/works/789` | 200 / 3.239 | — | `headers.json` 参照 |

上流500本文: `{"error":{"code":"INTERNAL_ERROR","message":"Internal server error"}}`

中継502本文: `{"error":"Failed to fetch work data"}`

2回目と比較作品の開始日時・URL・実測値は `repeat.json`、主要ヘッダーは `headers.json` に保存。
HTTPヘッダーだけからKV/R2のヒット・ミスを推定しない。

## 修正と検証

- 青空文庫URLから変換したミラーが404/410の場合だけ、元のURLへ1回フォールバックする。
  各リクエストの10秒タイムアウトを維持するため、この経路では最大約20秒かかり得る。
- ミラーの失敗を workId・URL・status とともに記録する。
- 本文サービスのKV/R2読書き、R2削除、ZIPデコード、取得時の例外を段階・workId・元例外とともに記録する。
  未処理のAPI例外にはリクエストパス、中継例外にはworkIdを記録する。
  APIのエラー本文に内部例外を公開しない。
- KV/R2の障害時の既存動作は維持。GitHub等から取得後の `KV.put()` 失敗が致命的になる動作も維持し、
  ログの `kv-write` で識別できることをテストする。キャッシュ耐障害性の変更は別課題。

Workersの回帰テストは通信応答だけを差し替え、実際のZIP・coreデコード・Workersランタイム・
ローカルKV/R2・HTTPルートを通す。404/410からの回復、ミラー成功、両取得元の失敗、
フォールバックしないステータス・URL、KV/R2への保存と再読出し、KV例外の識別を検証。
dayroaozoraでは取得した実データを用い、`fetchWork()` をモックせずに構造化まで検証する。

実通信の追加検証では、修正した `getContent()` に空のメモリKV/R2を渡し、
取得した本文を実際の `fetchWork()` / `parseStructured()` に通した。
対象作品の上流本文だけをこのローカルサービスに接続し、メタデータ・取得元・比較作品は実通信。
本番ストレージの状態の再現ではなく、修正した取得経路の疎通確認である。

| 作品 | 結果 |
| --- | --- |
| 47927「春浅き日に」堀 辰雄 | ミラー404 → 本体200 → 本文一致 → 9ブロック、1,909文字 |
| 789「吾輩は猫である」夏目 漱石 | 本番上流200/HIT → 2,316ブロック、321,177文字 |

実測は `verify-live.json`。文字数はdayroaozoraの段落集計値。
ZIPフィクスチャのSHA-256: `86922208e2107d0a98cc08a37d907e2bf5a1efa1948a9ebbede25a9b60d44e20`。
Workersの `tests/fixtures/047927.json` は公式ZIPのbase64・展開本文・本番メタデータを保存。
dayroaozoraの同名フィクスチャの `body` は公式ZIPから作ったraw応答形式であり、
本番上流が200で返したレスポンスではない。両フィクスチャは2026-09-06 JST取得。

検証コマンド（各リポジトリでlockfile固定のpnpm 10.33.0を使用）:

```sh
# dayroaozora: Node 26の組み込みwebstorageを無効化して既存jsdomテストを実行
NODE_OPTIONS=--no-experimental-webstorage pnpm test
pnpm lint
pnpm exec tsc --noEmit

# libroaozora: READMEに従いwrangler.toml.exampleからローカル設定を作成
pnpm --filter @libroaozora/core build
pnpm --filter @libroaozora/workers test
pnpm --filter @libroaozora/workers lint
pnpm --filter @libroaozora/workers lint:test
```

dayroaozoraの全151テストとlint・型チェック、Workersの全81テストとソース・scripts・testsの型チェックを通過。
その後追加したKV例外の2ケースと中継ログのアサーションは対象テストを再実行して確認。
初回のテスト実行ではNode 26のlocalStorage未提供による60件の失敗、および未作成のwrangler.tomlによる
Workers起動失敗があった。上記の実行条件を整えて再実行した。プロダクト側の関連外コードは変更していない。

## 残る確認

変更はローカルのみで未デプロイ。本番復旧は未確認。
本番ログで workId `047927` の元例外と失敗段階を確認する必要がある。
既存ログに情報がなければ、この計測コードのデプロイ後に固定IDを再リクエストして確認する。
本番での本文200・正しい本文・比較作品の成功を確認するまで、障害全体の完了とは扱わない。
メタデータ同期スクリプトも同じGitHubリポジトリを参照しているが、今回のメタデータ取得は成功しており、
同期経路への変更は今回の修正に含めていない。
