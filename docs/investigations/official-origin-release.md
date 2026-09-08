# 公式取得 A/Bリリース候補

> 過去の計画・検証記録です。以下の「未反映」「未認証」等は記録当時の状態です。後続の公開・復旧と残件は [2026-09-08の確認状態](../official-origin/status-2026-09-08.md) を参照してください。

2026-09-06 JST。**ローカル検証済み、本番未反映・本番適合未確認。C/Dは別リリース。**

## 対象と差分

対象候補は既存 `libroaozora` Worker（KV/R2 binding）と `dayroaozora` Nextアプリ。アカウント・KV ID・Next配信先・現在のデプロイSHAは未認証のため未確定。本番設定をプレースホルダーから推定しない。

本文とCSVの公式直接取得、KV/R2障害遷移、保存失敗時本文200、削除しない修復、isolate内取得共有/待機/上限、ZIP streaming/CRC、先読み停止、本文期限を変更。既存Wrangler更新も候補に含む。raw/plain・作品不存在404・著作権403・X-Cache-Statusを維持。旧metadata KV3キーの世代混在、訂正のブラウザ反映はC/D待ち。

同期スクリプトは公式URLに変更するが公開形式は旧形式。この候補のデプロイと同期実行は別操作であり、同期を勝手に実行しない。

## ローカル確認

- pnpm 10.33.0、core build成功。
- libro全test: core 59件、Workers 107件成功（実workerd KV/R2、47927・789実ZIPを含む）。全workspace lint、同期script型、Workersテスト型成功。
- dayro production build、ESLint、TypeScript成功。15ファイル157件成功。既存47927の実構造化、表示前先読みゼロ、表示後1件、停止、失敗反復防止、40秒期限を確認。
- dayro buildのmetadataBase警告は残存。導入時期の帰属は未評価。
- Wrangler dry-run成功。全metadata量での最終ローカルworkerd: cold 583/435ms、KV 103/153ms、R2 78/214ms、同時cold 408/556ms。全200、originはcold時各1回、hit時ゼロ。
- ZIP/展開量と設定は [上限記録](./official-origin-limits.md)。CPU/ピークメモリは本番確認が必要。

ログは `/tmp/official-origin-step2/`。開始差分と新規fixtureを含めたA/B候補を `/tmp/official-origin-step2/ab-candidate.tar.gz` に固定する。C以後の混在ワークツリーをこの候補としてデプロイしない。

## 本番操作前に揃えるもの（T009保留）

1. Cloudflare認証、account・Worker名・KV ID・R2 bucket/lifecycle・権限・契約枠、Nextの配信先、各現在SHAを読取り確認。
2. 既存 `metadata/all.json` と47927/789の既知ZIPキーの状態を読取り確認。バケット全件走査・全cache削除をしない。
3. この固定候補と実bindingを対応させ、対象・コード/設定差分・ローカル結果・復旧先を提示してデプロイ承認を得る。
4. 専用検証bindingでcold/保存障害、CPU・メモリを測定。本番cacheを消して障害注入しない。
5. 対象47927/789固定のraw/plain本文hash、2回目の保存利用、origin/status/storageログを確認。

## 停止・復旧

保存失敗が継続する場合はdayroの `PREFETCH_ENABLED=false` を反映し、`?prefetch=1` が204/no-storeか確認。today CDNに古いtrueが残っていても中継が止める。通常閲覧は継続する。

A/Bでは保存形式は旧形式のままなのでsnapshot pointer変更・cache一括削除は不要。問題のある設定値を検証済み値へ戻すか、公式直接取得を維持する検証済みA/Bコードを再デプロイする。元HEADのGitHub取得へ戻すのは復旧策にしない。初回の既知正常な公式版がまだないため、専用bindingの疎通成功候補を復旧先として記録してから本番へ進む。

公式停止時に未保存作品を返せない制約が残る。選定ID差替えで回避しない。Cでは版保存と旧版条件、Dでは再検証と読書位置を別途完成させる。

## C/Dへの引継ぎ

A/B候補SHA-256は `4a936f1553042595ebc7e09f3ce1aee9068b4796dd443bf92e64ae1a6dfc90a6`。この固定後にC/Dを実装・検証した。最新の認証調査、C中継単独候補、reader→writer→日次→Dの公開順序、CDN失効とv2復旧は [C/Dリリース記録](./official-origin-cd-release.md) を参照。本書のA/B検証値は固定候補に対応し、現ワークツリーの検証結果と混在させない。
