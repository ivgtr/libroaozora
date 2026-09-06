# 公式取得移行のPRと公開条件

この変更はローカル検証済みの候補から作成したレビュー用ブランチです。公開順序は次のとおりです。

1. libro: 公式取得・保存障害・負荷対策（codex/official-origin-fetch）
2. dayro: 本文取得期限・先読み制御（codex/official-origin-loading）
3. libro: 世代・本文版管理（codex/official-origin-versions）
4. dayro: 新しい本文応答への中継対応（codex/official-origin-relay）
5. dayro: 再検証と読書位置移行（codex/official-origin-reading）

同一repoの後続PRは前段ブランチをbaseとする。前段をマージ後、baseをmainへ切り替えて差分と検証を確認する。先行PRをsquashした場合は後続履歴との重複を解消してからレビューを続ける。

本番account/binding・契約枠・CPU/isolateピークメモリは未確認。対象・コード/設定差分・検証・復旧先を揃えて承認を得るまで、マージ・同期・本番反映を行わない。Cでは新reader公開→手動同期→中継→日次有効化、DではCの本番契約確認→公開→CDN切替確認の順を守る。

Vercel連携によるPR作成時の自動公開を避けるため、vercel.jsonのgit.deploymentEnabledでcodex/official-origin-*だけをfalseにしている。libroはproject rootがrepoルート/Web/Workersのいずれでも適用できるよう各位置へ設定した。mainなど指定外のブランチの設定は変えない。根拠: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration)（2026-09-06確認）。この設定の削除や対象ブランチからのデプロイも、公開前の確認に含める。

ソースの根拠は/tmp/official-origin-step2の固定候補と検証記録。PR分割時に製品コード・依存・fixtureが対応する検証済み候補とbyte一致することを確認した。追加差分はPR公開制御と資料のリンク/進捗のみ。
