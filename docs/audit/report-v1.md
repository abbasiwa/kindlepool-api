# KindlePool SponsorPool — Local Professional Audit Report (B1.3)

**Auditor**: mikwansa (internal, senior-engineer level) · **Date**: 2026-08-01 · **Version**: 1.2
**Target**: `contracts/sponsor-pool` (CONTRACT_VERSION 4) + Phase-2 services (indexer/relayer/notifier/monitor)
**Method**: B1.2 ten-pass systematic review (P1–P10) against `docs/SPEC.md`, `docs/known-issues.md`, `docs/coverage-report.md`

> **v1.2 update**: All must-fix contract findings (F-401, F-501, F-101, F-105, F-201, F-301, F-601) resolved in commit `7b7340b` (CONTRACT_VERSION 4), each with a regression test. All infra findings (F-701…F-1003) implemented in **P3** with vitest coverage in each service; F-705 waived + documented. Remaining: F-201 residual (public view fns do not extend TTL) + upgrade paths tracked as GitHub issues #2–#5. See §4.

---

## 1. Scope & baseline

| Artifact | Baseline | Status |
|---|---|---|
| Contract unit+proptest | 84/84 unit + proptest fuzz | ✅ green |
| Live testnet integration | 53/53 checks (fresh contract) | ✅ green |
| Coverage | pool.rs 95.66% lines / 100% fns; TOTAL 98.06% | ✅ ≥90% gate |
| Spec | docs/SPEC.md v7 (7 statuses, 38 entry points, 12 invariants) | ✅ matches code |
| Known-issues ledger | 23 contract + 6 infra | ✅ closed/pending per ledger |

## 2. Pass summary (B1.2)

| Pass | Scope | Result |
|---|---|---|
| P1 Auth | 21 require_auth sites + require_admin, per-entry-point | 5 findings (2 Medium, 2 Low, 1 Info) |
| P2 Storage/state | 22 DataKey variants, instance vs persistent, TTL | 3 findings (1 Medium, 2 Info) |
| P3 Arithmetic | all operators + math.rs | 2 findings (1 Medium, 1 Info) |
| P4 Reentrancy | token transfers, ordering, atomicity | 2 findings (1 **High**, 1 Info) |
| P5 Timelock | flow constants, pause/unpause, deadlines | 3 findings (1 **High**, 2 Info) |
| P6 Events | 20 topics vs SPEC p_* | 1 finding (Medium) |
| P7 Indexer | listener/db/api | 5 findings (1 **High**, 3 Medium, 1 Info) |
| P8 Relayer | relay endpoint | 4 findings (1 **High**, 2 Medium, 1 Info) |
| P9 Notifier | subscribe/notify | 2 findings (1 Medium, 1 Info) |
| P10 Monitor | checks/alerts | 3 findings (1 Medium, 1 Low, 1 Info) |

> **P3 status (post-audit)**: all infra findings F-701…F-1003 are now implemented (basic) with vitest coverage in each service. F-705 waived + documented. Upgrade paths tracked as GitHub issues #2–#5.

**Total: 30 findings — 4 High, 9 Medium, 4 Low, 13 Info.**

## 3. Finding register

Legend: 🔴 High · 🟠 Medium · 🟡 Low · ⚪ Info · ✅ verified-clean (counted separately, not listed)

### P1 — Auth

| ID | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-101 | 🟠 | **Creator self-approval**: `deposit` does not exclude the creator; `vote` does not exclude the creator. A creator can deposit above supporters' total and vote `approve` with full stake, making `yes_votes > no_votes` and collecting all deposits (incl. supporters') minus fee. | pool.rs:512-535 (vote now excludes creator via `#40 CreatorCannotVote`) | **FIXED `7b7340b`** — `vote` reverts `CreatorCannotVote` when voter == pool.creator. Regression: `regress_f101_creator_cannot_vote` |
| F-102 | ⚪ | `init_admin` double-init returns `#14 AlreadyFinalized` — misleading code for "already initialized" | pool.rs:81-83 | Waive (documented, tested) |
| F-103 | ⚪ | Error-code reuse: propose_admin self → `#3 InvalidGoal`; accept_admin mismatch → `#33 CallerIsNotPendingAdmin` | pool.rs:94-113 | Waive (consistent with KI-010 policy) |
| F-104 | 🟡 | `register_referral` accepts arbitrary `pool_id` (no existence check) and arbitrary referee; unauthenticated reference to non-existent pools pollutes storage; refund-path spam | pool.rs:1088-1089 (now validates pool exists) | **FIXED `7b7340b`** (with F-105 batch) — `get_pool_internal` guard added. Regression: `regress_f105_register_referral_unknown_pool` |
| F-105 | 🟠 | **Referral self-credit**: finalize credits rewards from `DataKey::Referral(pool.creator)` for every supporter matched to a pre-registered referee list; creator can pre-register all supporters and self-credit up to 5% of deposits as "bonus" post-payout (balance-bounded by contract balance after fee) | pool.rs:603-648 (credit loop now caps by fee + skips creator) | **FIXED `7b7340b`** — rewards capped by pool fee (F-105), creator excluded, reserved from fee before treasury. Regression: `regress_f105_referral_capped_at_fee` |

### P2 — Storage/state

| ID | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-201 | 🟠 | **TTL only on write**: Pool/Supporter/Dispute/Vote/Referral records get `extend_ttl` on write (11 sites) but never on read. `set_flow_constants` allows vote_deadline up to MAX_FLOW_CONSTANT (365 d) while records expire ~31 d. A pool inactive >31 d → archived records → `PoolNotFound` → **funds stuck in contract** | pool.rs:228-242 (TTL on read now) | **FIXED `7b7340b`** — rolling TTL on read paths. Residual: public view fns (`get_pool`, `get_supporter`, `get_dispute`, `get_arbitrator_votes`) don't extend TTL (read-only, accepted). Regression: `regress_f201_ttl_refreshed_on_read` |
| F-202 | ⚪ | `DataKey::ReferralRewards(Address)` declared, never used (dead key) | types.rs:234 | Waive (harmless; remove on next release) |
| F-203 | ⚪ | `get_platform_stats`/`get_pools_by_*` iterate 1..=count — O(n) per view; gas-DoS at scale (view-only) | pool.rs:1095-1123 | Waive (view-only; document limit) |

### P3 — Arithmetic

| ID | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-301 | 🟠 | **math.rs not used by contract**: proptests (98.78% coverage) target `math.rs` functions which `pool.rs` never calls; on-chain inline math (checked_mul + /10000) is covered only by unit tests | pool.rs:598,730,881 (now routes through `math::`) | **FIXED `7b7340b`** — settlement/referral/dispute-fee paths call `math::settle_fee`, `math::referral_reward`, `math::dispute_fee` |
| F-302 | ⚪ | Fee/referral rounding truncates toward zero (floor) — deterministic, documented | math.rs:16-21, pool.rs:573 | Waive (invariant I3 holds: payout + fee = total) |

### P4 — Reentrancy

| ID | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-401 | 🔴 | **`withdraw_fees` performs no token transfer**: decrements `FeeTotal`, emits event, but never moves funds to treasury. Treasury never receives collected fees; FeeTotal bookkeeping diverges from contract balance permanently | pool.rs:197-226 (now transfers; ABI `withdraw_fees(caller, amount, token)`) | **FIXED `7b7340b`** — transfers contract→treasury in `token`; balance-guarded; FeeTotal decremented after transfer. Regression: `regress_f401_withdraw_fees_guarded_and_transfers`, `regress_f401_withdraw_fees_transfers_to_treasury` |
| F-402 | ⚪ | finalize fee→treasury uses hard `transfer` — if treasury can't receive, finalize reverts (no try_transfer). Treasury is admin-set; acceptable | pool.rs:555-557 | Waive (documented; treasury is trusted admin config) |

### P5 — Timelock

| ID | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-501 | 🔴 | **`finalize` does not block DISPUTED/APPEALED pools**: guards only PAID/EXPIRED (L520) and early AWAITING_VOTE (L526). During an open dispute anyone can finalize using stale yes/no votes; if `goal_met && work_submitted && approved` → creator paid while arbitration is pending; a later supporters-win `close_dispute` then refunds from an emptied contract (try_transfer silently fails) | pool.rs:566-577 (now blocks via `#41 DisputePending`) | **FIXED `7b7340b`** — finalize reverts `DisputePending` on DISPUTED/APPEALED. Regression: `regress_f501_finalize_blocked_during_dispute` |
| F-502 | ⚪ | `schedule_pause` repeatable (push notice out); no cancel — admin-only, no harm | pool.rs:124-133 | Waive |
| F-503 | ⚪ | Early finalize at `pool.deadline` even inside the vote window (vote_deadline > deadline) → settlement with partial votes; zero-vote case refunds safely | SPEC §20 documents this | Waive (spec-sanctioned; refund-safe) |

### P6 — Events

| ID | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-601 | 🟠 | **`appeal_dispute` emits no event**: DISPUTED→APPEALED transition + doubled fee invisible to indexer/notifier/monitor; 19/20 transitions have events | pool.rs:1010-1019 (now publishes `p_appl`) | **FIXED `7b7340b`** — added `TOPIC_DISPUTE_APPEALED` + `DisputeAppealedEvent`. Regression: `regress_f601_appeal_emits_event` |

### P7 — Indexer

| ID | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-701 | 🔴 | **Event payload parsing unverified/fragile**: RPC returns scval JSON (`{"u64":…}`, `{"symbol":…}`), code treats topics as plain strings; `parseInt(t(4))`/`parseInt(topics[1])` on objects → NaN → events silently dropped. Never exercised by A3 (which invoked contract directly, not the indexer pipeline) | listener.ts (rewritten: `src/scval.ts` decodes symbol + value map) | **FIXED (P3)** — `decodeEvent` uses `scValToNative`; all topics read from value map. Tests: `test/scval.test.ts` |
| F-702 | 🟠 | **total_supporters overcount**: `p_dep` increments `total_supporters + 1` on every deposit event incl. repeat deposits by same supporter | `db.ts upsertSupporter` now returns created-flag; listener increments only on first deposit | **FIXED (P3)** — `test/handlers.test.ts` |
| F-703 | 🟠 | **Only 7/20 topics handled**: disputes (p_dres), arbitration votes, cancel, pause, fee, referral events ignored → pools stay `awaiting_vote` forever after dispute; monitors can't see disputes | `listener.ts EVENT_KEYS` now covers all 20 topics; `contract_state`, `arbitrator_votes`, `referrals` tables added | **FIXED (P3)** — `test/handlers.test.ts` |
| F-704 | 🟠 | `lastLedger` in-memory: restart re-indexes trailing 100 ledgers → duplicate events (compounds F-702 double count); downtime >100 ledgers → silent gaps | `checkpoints` table + `loadCursor`/`saveCursor` | **FIXED (P3)** — `test/handlers.test.ts` |
| F-705 | 🟡 | `pools.id` = contract pool_id (AUTOINCREMENT + explicit id) — multi-contract indexing collides on PRIMARY KEY → insert crash, event skipped | Documented in `services/indexer/README.md` (F-705) | ⚠️ waived for single-contract MVP — documented |

### P8 — Relayer

| ID | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-801 | 🔴 | **Relayer never submits the user's transaction**: decodes `tx_xdr`, then discards it and submits its own fee-bearing `manageData` tx; the user's signed contract invocation never reaches the network. Relay is functionally broken (KI-105 note was cosmetic) | `src/relay.ts` (fee-bump submission of the user's signed envelope) | **FIXED (P3)** — fee-bump wraps + submits the user's own tx. Tests: `test/relay.test.ts` |
| F-802 | 🟠 | No auth/allowlist on `/relay` — anyone can trigger relayer-funded txs (spam); only rate-limit (50/min) mitigates | `KINDPOOL_RELAYER_ALLOWLIST` env + `validateRequest` | **FIXED (P3)** — allowlist returns 403 for non-listed addresses. Tests: `test/relay.test.ts` |
| F-803 | 🟠 | `source_address` unvalidated (not an account check, no ownership proof) — used only for manageData memo; no verification the envelope belongs to it | `validateRequest` compares `tx.source` to `source_address` | **FIXED (P3)** — mismatch → 400. Tests: `test/relay.test.ts` |
| F-804 | ⚪ | `fee = '100000'` hardcoded; timebounds 300 s; no fee-bump/sponsorship — fee economics unchecked | `KINDPOOL_RELAYER_FEE`, `KINDPOOL_RELAYER_TXB_TTL_SECONDS` env | **FIXED (P3)** — fee + TTL configurable. Tests: `test/relay.test.ts` |

### P9 — Notifier

| ID | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-901 | 🟠 | **subscribe/notify unauthenticated**: anyone can subscribe a victim's address with attacker email → victim's notifications leak; `/notify` is a public subscription oracle; no rate limit → spam | `src/auth.ts` (ownership signature) + `x-api-key` on `/notify` + rate limit | **FIXED (P3)** — subscribe requires signed ownership proof; `/notify` requires API key. Tests: `test/notifier.test.ts` |
| F-902 | ⚪ | In-memory subscriptions lost on restart (KI-101 class — API keys) | `src/store.ts` (SQLite-backed subscriptions) | **FIXED (P3)** — persisted. Tests: `test/notifier.test.ts` |

### P10 — Monitor

| ID | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| F-1001 | 🟠 | Health/anomaly history in-memory; persisted only on SIGINT (crash loses data) | `src/persistence.ts` (SQLite-backed health/anomalies/failed_alerts) | **FIXED (P3)** — every tick persisted. Tests: `test/monitor.test.ts` |
| F-1002 | 🟡 | Anomaly detection shallow (rpc_down, indexer_down, pool-count spike); no contract-level checks (stuck disputes, refund failures, pause state) | `src/checks.ts` (fee_spike, paused-with-activity, disputes_pending) | **FIXED (P3, basic)** — pure detection fn. Tests: `test/monitor.test.ts` |
| F-1003 | ⚪ | Alert webhook fire-and-forget (`.catch(()=>{})`), no retry (KI-104) | `failed_alerts` retry queue + `flushRetryQueue` worker | **FIXED (P3)** — 3-attempt queue with persistence. Tests: `test/monitor.test.ts` |

## 4. Must-fix summary (pre-mainnet)

| # | Finding | Impact | Fix size | Status |
|---|---|---|---|---|
| 1 | F-401 withdraw_fees no transfer | Treasury never paid; stranded fees | Small (contract) | ✅ **FIXED** `7b7340b` (+ regression tests) |
| 2 | F-501 finalize during dispute | Settlement bypasses arbitration | Small (contract) | ✅ **FIXED** `7b7340b` (+ regression test) |
| 3 | F-801 relayer never relays | Core relayer feature broken | Medium (service) | ✅ **FIXED (P3)** fee-bump submission + tests |
| 4 | F-701 indexer event parsing | Indexer data silently wrong/empty | Medium (service) | ✅ **FIXED (P3)** scval decoder + tests |

Contract fixes F-201 (TTL on read), F-105 (referral self-credit), F-601 (appeal event), F-301 (math.rs wiring), F-101 (creator vote exclusion) — **all FIXED in `7b7340b`** with regression tests. Infra findings F-702/703/704/705 (indexer), F-802/803/804 (relayer), F-901/902 (notifier), F-1001/1002/1003 (monitor) — **all FIXED in P3** with vitest coverage (F-705 waived + documented). Remaining: F-201 residual (public view fns don't extend TTL — read-only, accepted for MVP) + P3 upgrade paths (issues #2–#5).

## 5. Sign-off

- [x] Ten passes executed (P1–P10) against current HEAD.
- [x] All 30 findings evidenced with file:line and disposition.
- [x] KI ledger updated references: F-201↔KI-002/013/021, F-105↔KI-015/016/020, F-902↔KI-101, F-1003↔KI-104.
- [x] Contract fixes (F-401, F-501, F-201, F-105, F-601, F-301, F-101) — **landed in `7b7340b` (CONTRACT_VERSION 4)**, regression-tested.
- [x] Re-run A3 live suite + coverage after fixes — 53/53 live, 84/84 unit, coverage ≥90% gate.
- [x] Infra fixes (F-701…F-1003) — **landed in P3** with vitest coverage; F-705 waived + documented.
- [ ] B2 RFQ to reference this report as "internal audit v1".
- [ ] P3 upgrade paths (issues #2–#5) — tracked, not part of this milestone.

**Engineer**: mikwansa
**Status**: v1.2 — contract + infra findings resolved; upgrade paths tracked as GitHub issues #2–#5
