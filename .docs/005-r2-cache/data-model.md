# Data Model: R2 中間キャッシュ導入

## エンティティ

### R2 オブジェクト

| キー | 値 | 書き込み契機 | 備考 |
|---|---|---|---|
| `metadata/list_person_all_extended_utf8.zip` | CSV zip バイナリ (~2MB) | 日次 cron (syncMetadata) | 固定キー、上書き更新 |
| `cards/{personId}/files/{fileName}.zip` | 本文 zip バイナリ | オンデマンド (getContent) | sourceUrl から導出、冪等書き込み |

**キー導出ロジック**:
```
sourceUrl: https://www.aozora.gr.jp/cards/000148/files/789_ruby_5639.zip
R2 key:   cards/000148/files/789_ruby_5639.zip
導出:     new URL(sourceUrl).pathname.slice(1)
```

### KV キャッシュ

| キー | 値 | TTL | 変更点 |
|---|---|---|---|
| `meta:works` | `Work[]` JSON (~3-5MB) | 3 日 (259,200s) | TTL 24h → 3 日に延長 |
| `meta:persons` | `Person[]` JSON | 3 日 (259,200s) | TTL 24h → 3 日に延長 |
| `meta:syncedAt` | ISO 8601 文字列 | 3 日 (259,200s) | TTL 24h → 3 日に延長 |
| `content:{workId}` | UTF-8 テキスト | 30 日 (2,592,000s) | TTL なし → 30 日に変更 |

## Env 型拡張

```typescript
export interface Env {
  KV: KVNamespace
  R2: R2Bucket    // 追加
}
```

## データフロー

### メタデータ（読み取り）

```
getMetadata(env)
  1. KV["meta:works"] → HIT → return
  2. R2["metadata/...zip"] → HIT → try restoreMetadata(data, env)
     → 成功: return
     → 失敗: R2 delete → Layer 3 へフォールスルー
  3. fetchAndSyncMetadata(env) → return
```

### メタデータ（定期同期）

```
syncMetadata(env)  ← scheduled() から呼び出し
  1. fetchAndSyncMetadata(env)
```

### メタデータ（zip → KV 復元）

```
restoreMetadata(zipData, env)  ← getMetadata #2 / fetchAndSyncMetadata から共通呼び出し
  1. parseCSVZip(zipData) → { works, persons }
  2. writeMetadata(env.KV, works, persons, TTL 3d)
  3. return { works, persons }
```

### メタデータ（GitHub → R2 + KV 伝搬）

```
fetchAndSyncMetadata(env)  ← syncMetadata / getMetadata #3 から共通呼び出し
  1. fetchCSVZip() (GitHub) → rawZip
  2. restoreMetadata(rawZip, env) → result  ← parse 成功で正常データ確定
  3. R2 put("metadata/...zip", rawZip)  ← ベストエフォート（parse 成功後のみ）
  4. KV put("meta:syncedAt", now)
  5. return result
```

### 本文（読み取り + オンデマンド同期）

```
getContent(workId, sourceUrl, env)
  1. KV["content:{workId}"] → HIT → return
  2. R2[toR2Key(sourceUrl)] → HIT → try decodeContentZip()
     → 成功: KV put (TTL 30d) → return
     → 失敗: R2 delete → Layer 3 へフォールスルー
  3. fetch(resolveContentUrl(sourceUrl)) (GitHub)
     → decodeContentZip() → R2 put(toR2Key(sourceUrl), rawZip)  ← ベストエフォート（decode 成功後のみ）
     → KV put (TTL 30d) → return
```

### 共有ヘルパー

```
csv-fetcher.ts:
  fetchCSVZip(): Uint8Array          — GitHub から CSV zip を取得
  parseCSVZip(data): ParseResult     — zip → decompress(.csv) → UTF-8 decode → parseCSV

metadata.ts:
  restoreMetadata(zipData, env): Result   — zip → parse → KV 復元（共通操作）
  fetchAndSyncMetadata(env): Result       — GitHub fetch → R2 put → restoreMetadata（共通操作）

content.ts:
  decodeContentZip(data): string     — zip → decompress(.txt) → Shift-JIS decode
  toR2Key(sourceUrl): string         — aozora.gr.jp URL → R2 キー
```

## 状態遷移

R2 オブジェクトは 2 つの状態のみ:

```
[存在しない] ---(初回書き込み)--→ [存在する]
[存在する]   ---(上書き更新)---→ [存在する]  ※メタデータの日次更新
```

R2 オブジェクトに TTL はない。一度書き込まれたら永続。削除は手動運用のみ。
