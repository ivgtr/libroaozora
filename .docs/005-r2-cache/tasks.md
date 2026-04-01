# Tasks: R2 中間キャッシュ導入

**Input**: Design documents from `.docs/005-r2-cache/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Env 型拡張

- [x] T001 Add `R2: R2Bucket` to Env interface in `packages/workers/src/env.ts`

---

## Phase 2: Foundational

**Purpose**: csv-fetcher 分離とテストフィクスチャ。T002 と T003 は並行実行可能。

- [x] T002 [P] Split `fetchAndParseCSV` into `fetchCSVZip()` + `parseCSVZip()` in `packages/workers/src/lib/csv-fetcher.ts` — 既存の `fetchAndParseCSV` は新関数の合成として残し、Phase 4 で除去する
- [x] T003 [P] Add `seedR2()` helper and zip fixture data in `packages/workers/tests/fixtures/seed.ts`

**Checkpoint**: 基盤準備完了。Phase 3 は T001 完了後に開始可能（T002 不要）。Phase 4 は T001 + T002 完了後に開始可能。

---

## Phase 3: US1 - 3 層フォールバックによる本文取得 (P1) 🎯 MVP

**Goal**: KV → R2 → GitHub の 3 層フォールバックで本文を取得。R2 ヒット時は GitHub にアクセスしない。GitHub フォールバック時は R2 にオンデマンド保存。KV TTL 30 日。

**Independent Test**: 本文取得エンドポイントに対し、R2 にデータがある場合・ない場合・GitHub が失敗する場合の各パターンでリクエストを送信し、期待通りのレスポンスが返ること。

**Covers**: US4（本文オンデマンド遅延同期）、US5（KV 本文 TTL 30 日）

**Dependencies**: T001

### Implementation

- [x] T004 [US1] Add `toR2Key(sourceUrl)` and `decodeContentZip(data)` private helpers in `packages/workers/src/services/content.ts` — `toR2Key`: `new URL(sourceUrl).pathname.slice(1)`, `decodeContentZip`: `decode(decompress(data, ".txt"))`
- [x] T005 [US1] Refactor `getContent` to KV → R2 → GitHub 3-layer fallback in `packages/workers/src/services/content.ts` — change signature from `kv: KVNamespace` to `env: Env`, add R2 read path, add R2 best-effort write on GitHub fallback, set KV TTL to 2,592,000s (30d), update `cacheHit` to mean "no GitHub fetch" (R2 hit = true)
- [x] T006 [US1] Update `getContent` call site to pass `c.env` instead of `c.env.KV` in `packages/workers/src/routes/works.ts`
- [x] T007 [US1] Add R2 layer test cases in `packages/workers/tests/services/content.test.ts` — KV hit (existing), R2 hit + KV miss, R2 miss + GitHub success + R2 write verification, all sources fail → error, X-Cache-Status: HIT for R2 hit

**Checkpoint**: US1 完了。本文取得の 3 層フォールバックが動作し、オンデマンド R2 同期と TTL 30 日が有効。

---

## Phase 4: US2 + US3 - メタデータ 3 層フォールバック + 定期同期 (P1/P2)

**Goal**: メタデータ取得を KV → R2 → GitHub の 3 層フォールバックに改修。日次 cron で GitHub → R2 → KV に事前同期。KV TTL 3 日。

**Independent Test**: メタデータ取得エンドポイントに対し、KV・R2・GitHub の各組み合わせでリクエスト。スケジュールトリガーで R2 + KV が更新されること。

**Covers**: US5（KV メタデータ TTL 3 日）

**Dependencies**: T001, T002

### Implementation

- [x] T008 [US2] Add `restoreMetadata(zipData, env)` and `fetchAndSyncMetadata(env)` private helpers in `packages/workers/src/services/metadata.ts` — `restoreMetadata`: `parseCSVZip → writeMetadata → return`, `fetchAndSyncMetadata`: `fetchCSVZip → R2 put (best-effort) → restoreMetadata`
- [x] T009 [US2] Refactor `getMetadata` to KV → R2 → GitHub 3-layer fallback in `packages/workers/src/services/metadata.ts` — change signature to `env: Env`, path 2: `R2 get → restoreMetadata`, path 3: `fetchAndSyncMetadata`, update TTL to 259,200s (3d)
- [x] T010 [US2] Refactor `getWorks`, `getPersons`, `getSyncedAt` signatures from `kv: KVNamespace` to `env: Env` in `packages/workers/src/services/metadata.ts`
- [x] T011 [US3] Refactor `syncMetadata` to use `fetchAndSyncMetadata(env)` and remove old `fetchAndParseCSV` import in `packages/workers/src/services/metadata.ts`
- [x] T012 [US2] Update `scheduled()` to pass `env` instead of `env.KV` in `packages/workers/src/index.ts`, and update route handlers to pass `c.env` in `packages/workers/src/routes/works.ts`, `packages/workers/src/routes/persons.ts`, `packages/workers/src/routes/health.ts`
- [x] T013 [US2] Add R2 layer test cases in `packages/workers/tests/services/metadata.test.ts` — KV hit (existing), R2 hit + restoreMetadata, fetchAndSyncMetadata (GitHub → R2 + KV), sync failure handling (GitHub fail → existing data preserved)
- [x] T014 [US2] Remove deprecated `fetchAndParseCSV` export from `packages/workers/src/lib/csv-fetcher.ts`

**Checkpoint**: US2 + US3 完了。メタデータの 3 層フォールバックと日次同期が動作し、TTL 3 日が有効。

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: ルートテスト更新と全体検証

**Dependencies**: Phase 3 + Phase 4

- [x] T015 Update route integration tests with R2 seed data in `packages/workers/tests/routes/works.test.ts`, `packages/workers/tests/routes/persons.test.ts`, `packages/workers/tests/routes/health.test.ts`
- [x] T016 Run full test suite (`pnpm test`) and validate all acceptance scenarios pass

---

## Dependencies & Execution Order

### Phase Dependencies

```
T001 (env.ts) ──┬──→ Phase 3 (US1: content)
                │
T002 (csv-fetcher) ──→ Phase 4 (US2+US3: metadata)
                │
T003 (seed.ts) ─┘

Phase 3 + Phase 4 ──→ Phase 5 (Polish)
```

- **T001 と T002 は並行実行可能**（相互依存なし）
- **Phase 3 は T001 のみに依存**（csv-fetcher 不要、content.ts は csv-fetcher を使わない）
- **Phase 4 は T001 + T002 に依存**（metadata.ts は新しい fetchCSVZip / parseCSVZip を使う）
- **Phase 3 と Phase 4 は並行実行可能**（異なるファイルを変更）

### User Story Dependencies

- **US1 (P1)**: Phase 2 の T001 完了後に開始可能。他の US に依存しない
- **US2 + US3 (P1/P2)**: Phase 2 の T001 + T002 完了後に開始可能。US1 に依存しない
- **US4 (P2)**: US1 の実装に含まれる（content.ts の R2 best-effort write）
- **US5 (P3)**: US1 と US2 の実装に含まれる（TTL パラメータ）

### Within Each Phase

- ヘルパー関数 → メイン関数リファクタリング → ルート更新 → テスト の順

### Parallel Opportunities

- T001 + T002: 並行（異なるファイル）
- T002 + T003: 並行（異なるファイル）
- Phase 3 全体 + Phase 4 全体: 並行（content.ts vs metadata.ts）

---

## Parallel Example: Phase 3 + Phase 4

```
# Phase 1 + 2 完了後、以下を並行実行:

# Stream A: US1 (content)
T004 → T005 → T006 → T007

# Stream B: US2 + US3 (metadata)
T008 → T009 → T010 → T011 → T012 → T013 → T014
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. T001 (env.ts)
2. T003 (seed.ts)
3. T004 → T005 → T006 → T007 (content 3-layer)
4. **STOP and VALIDATE**: 本文取得の 3 層フォールバックを独立テスト
5. Deploy/demo if ready

### Full Delivery

1. T001 + T002 並行 → T003
2. Phase 3 (US1) + Phase 4 (US2+US3) 並行
3. Phase 5 (Polish)
4. 全テスト通過を確認

---

## Notes

- T002 で `fetchAndParseCSV` は新関数の合成として残し、T014 で除去する（段階的移行）
- R2 書き込みはすべてベストエフォート（try-catch で囲み、失敗してもレスポンスをブロックしない）
- `cacheHit` の意味は「GitHub fetch を行わなかったか」に再定義（R2 ヒット = true）
- 既存テストは Phase 4 完了まで `fetchAndParseCSV` 互換で動作する
