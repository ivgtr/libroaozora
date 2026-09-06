# ローカル実ブラウザ検証

2026-09-06 JST、Chromium 151.0.7922.34 / Playwright 1.62.1、390×844、reduced motion。結果は [JSON](./browser-results.json)、更新通知の画面は [PNG](./updated-reading.png)。7シナリオ成功、未処理pageerror 0件。今日を47927、明日を789にするtoday応答だけをfixture化し、選定リストのソースは変更していない。

公式由来の保存済みZIP→ローカルworkerd/R2/KV→実Next production server→IndexedDB/localStorage→React表示を通した。本文HTTPをブラウザでmockしていない。snapshotは実publishSnapshotで投入し、同URLのCSV更新相当・一時503・復旧・著作権停止をadmin操作で切り替えた。revision変更直後にはisolateを入れ替え、pointerを観測した別isolateからの配信を再現した。60秒境界は別途unit testで確認している。

1. upstream訂正が現在の読書画面を差し替えない。
2. 一時503で識別済みpreviousを表示し、checkedAtを進めず同一本文の位置を保つ。
3. 開き直しで訂正本文へ切り替え、位置だけ先頭に戻し累積99を保持する。
4. 本棚favorite_completedの履歴を保って位置を戻す。
5. Chromiumの実offlineモードとクライアント内遷移で旧v2本文を開き、本文ID不明同士の旧位置を保つ。
6. onlineの最初の識別済み本文でv2→v3、旧位置ID不明をリセットする。
7. 提供停止を確認してIDBを無効化し、その後offlineでも復活させない。

`browser-harness.mts` / `browser-verify.mjs` は実行したそのままの検証スクリプトを保存したもので、汎用CI設定ではない。環境固有の絶対パスを含む。再実行時はrepo root・一時ディレクトリ・既存Playwrightの場所を実行環境に合わせる。追加依存を製品へ導入していない。

再現の準備はcore build、Wrangler `deploy --dry-run --outdir /tmp/official-origin-step2/d-worker`（ローカルbundleのみ）、同ディレクトリへの添付revised47927.zip配置。Workers workspaceの既存tsxでharnessを起動（9797とadmin 9798）し、dayroを `LIBROAOZORA_API_URL=http://127.0.0.1:9797` でbuild/start（3099）してからNodeでverifyを実行する。API環境変数名は `.env.example` と照合する。dayroはこの実行環境で `NODE_OPTIONS=--no-experimental-webstorage` を使用した。

検証ログとtraceは `/tmp/official-origin-step2/browser-verify.log` / `browser-trace.zip`。添付ZIPは047927の「二三日前の或る温かな」を「訂正された温かな」に変えたテスト専用派生物で、公式更新を主張するものではない。最初の表示に現れる原文タイトルの除去など、既存構造化ルールの変更は今回の範囲に含めなかった。
