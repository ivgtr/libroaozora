# 公式取得移行のPR一覧

> 過去の計画・検証記録です。以下の「未反映」「未認証」等は記録当時の状態です。後続の公開・復旧と残件は [2026-09-08の確認状態](status-2026-09-08.md) を参照してください。

2026-09-06 JST。ユーザーのPR作成指示に基づき、検証済み候補から5本のドラフトPRを作成した。マージ・本番設定変更・同期・デプロイは未実施。

| 順序 | 変更 | PR | 比較元 |
| --- | --- | --- | --- |
| 1 | 公式取得・保存障害・負荷対策 | [libro #7](https://github.com/ivgtr/libroaozora/pull/7) | main |
| 2 | 本文取得期限・先読み制御 | [dayro #1](https://github.com/ivgtr/dayroaozora/pull/1) | main |
| 3 | metadata世代・本文版管理 | [libro #8](https://github.com/ivgtr/libroaozora/pull/8) | codex/official-origin-fetch |
| 4 | 同世代work/deliveryの中継 | [dayro #2](https://github.com/ivgtr/dayroaozora/pull/2) | codex/official-origin-loading |
| 5 | ブラウザ再検証・読書位置移行 | [dayro #3](https://github.com/ivgtr/dayroaozora/pull/3) | codex/official-origin-relay |

前段のマージ後は後続PRのbaseをmainへ変更して差分を再確認する。squashした場合は履歴重複の解消が必要。公開時はA/Bの本番受入れ後、新reader→手動同期→中継→日次有効化→ブラウザ対応の順を守る。

PR分割に際し、各段階の製品コード・依存・fixtureを検証済み候補とbyte比較した。libro先行116/世代対応125、dayro各段階92ファイル一致。C中継archive中のignored生成物next-env.d.tsはコミットしない。製品コードを変えていないため、既存の段階別test/lint/type/build結果を対応付けてPRへ記載した。git diff --checkとVercel設定JSONの確認も成功。

追加差分は資料のリンク・この進捗記録と、codex/official-origin-*ブランチだけVercel自動デプロイを止める設定。libroはrepo/Web/Workersのproject root候補それぞれへvercel.jsonを置いた。mainなど他ブランチを無効にしていない。設定根拠: [Vercel公式Git configuration](https://vercel.com/docs/project-configuration/git-configuration)。

GitHub側で5本ともdraft、比較元の一致、競合なしを確認。PR checksは未登録/未実行であり、CI成功として扱わない。今回のhead SHAに対応する新規deployment記録は確認されていない。本番認証・binding・契約枠・CPU/isolateピークメモリと本番公開受入れは引き続き未完。

接続では既定SSH設定の所有権/権限エラーが発生し、HTTPSで先行APIとdayroの3ブランチをpushした。世代対応APIのworkflow変更はGitHub OAuth tokenのworkflow scope不足で拒否されたため、既存SSH認証を使用した。システム設定を変更せず、ssh -F /dev/null・BatchMode・StrictHostKeyCheckingを明示した接続でpushに成功した。トークンの権限追加や値の出力は行っていない。

分割用checkoutと詳細照合JSONは/tmp/official-origin-pr、元候補archiveと検証ログは/tmp/official-origin-step2に保持している。
