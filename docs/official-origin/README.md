# 青空文庫取得経路の変更

現在の完了事項・残件は [2026-09-08の確認状態](./status-2026-09-08.md) を参照してください。本文取得は本番復旧済みで、dayroの中継・ブラウザ対応もマージ・公開済みです。メタデータ同期と訂正反映全体の本番受入れは残っています。

このディレクトリは `dayroaozora` と `libroaozora` にまたがる実装時の参照資料です。
作成日: 2026-09-06 JST。計画と実装記録を含みます。本番デプロイ完了を示すものではありません。
同日、7項目の推奨方針についてユーザー合意を得て実装計画へ反映しました。実装範囲・初期設定は実装計画を参照してください。

- [実装計画](./official-origin-plan.md): 合意済みの方針、作業順序、検証、移行手順。
- [追加検討事項](./official-origin-decisions.md): 検討開始時の論点一覧と合意後の参照先。
- [各項目の考察・推奨仕様](./official-origin-analysis.md): 採用方針の判断理由と代替案。実装の正本は実装計画。
- [Step 1 調査記録](./official-origin-research.md): 調査時点のコード、当時の未コミット差分の意図、検証、計画への補足。
- [Step 1 実行設計](./official-origin-design.md): 版・世代・API契約・ブラウザ移行の具体化と判断理由。
- [Step 2 実行タスク](./official-origin-tasks.md): 23タスクの依存関係、変更対象、受け入れ条件・検証方法、先行リリース範囲。進捗はタスク一覧とStep 2記録を参照。
- [47927の調査記録](../investigations/47927/README.md): HTTP測定、実データ検証、直接原因の未確定部分。

実装方針の正本は作業ルートの `docs/official-origin-plan.md` です。単独のcheckoutにはその親ディレクトリを含まないため、ここには [実装計画のGit管理用コピー](./official-origin-plan.md) とStep 2記録を置きます。

2026-09-06のStep 1で調査・設計・タスク化を完了。Step 2ではA/B先行候補を固定後、C/Dまでローカル実装・検証を実施しました。その候補作成時点では本番操作は未実施でした。

実装判断と検証は [Step 2記録](./step2-log.md)、当初の公開計画と復旧上の制約は [C/Dリリース資料](../investigations/official-origin-cd-release.md) を参照してください。

- [Step 2 PR一覧](./official-origin-prs.md): 当時のドラフトPR分割とレビュー順序の記録。
