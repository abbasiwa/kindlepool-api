# Known Issues Ledger

Complete history of every flaw found in SponsorPool, its fix, and its regression test. Required reading for auditors (B1) and for the RFQ (B2).

**Legend**: ✅ fixed + regression-tested · ⚠️ accepted risk (documented) · 🔴 open

**Version note**: KI-001…KI-016 describe issues found against pre-v4 builds. KI-017…KI-023 are the B1.3 audit-fix batch (commit `7b7340b`), all resolved in CONTRACT_VERSION 4. KI-016 itself is now FIXED in the contract (v4 `claim_refund`) — see the pending note under it.

---

## Contract Issues

| ID | Severity | Date | Description | Root cause | Fix | Regression test |
|---|---|---|---|---|---|---|
| KI-001 | 🔴 Critical | Jul 29 | `set_fee` authorization bypass — any caller could set fee & redirect treasury | No stored `Admin`; `require_auth` only proved self-identity | Stored admin model (`initialize`, `get_admin`, `propose_admin`, `accept_admin`); `require_admin` check | `test_non_admin_set_fee_reverts` (#32) |
| KI-002 | High | Jul 30 | Instance storage overflow — contract unusable past ~30 pools (`ResourceLimitExceeded`) | All 57 storage calls on 32KB-capped instance storage | Migrated per-record keys (Pool, Supporter, SupporterList, Dispute, ArbitratorVote*, Referral) to persistent storage + 31-day TTL | Live suite S1–S15 on fresh contract (49/49) |
| KI-003 | High | Jul 31 | 7 sites returned `WasmVm InvalidAction` trap instead of clean contract errors (accept_admin #33, get_pool #2, withdraw #31, disputes #2) | `.ok_or(...).unwrap()` panics in no_std Soroban guest | Replaced with explicit `panic_with_error!` matches | `test_accept_admin_no_pending_clean_error` (#33), `test_get_pool_nonexistent_clean_error` (#2), `test_withdraw_fees_no_balance_clean_error` (#38), `test_raise_dispute_nonexistent_pool_clean_error`, `test_close_dispute_nonexistent_clean_error`, `test_appeal_dispute_nonexistent_clean_error` |
| KI-004 | High | Jul 31 | Split-brain storage — `ArbitratorVoteList` written to instance, read from persistent; votes silently lost | Partial migration missed one chain | Fixed to persistent + TTL | Live S4–S6 (disputes tally correctly) |
| KI-005 | Medium | Jul 29 | `close_dispute` paid creator the full amount; platform fee not applied (unlike `finalize`) | Fee logic only in finalize | Fee deduction added to close_dispute payout branch + FeeTotal tracking | Live S4 (creator paid minus fee) |
| KI-006 | Medium | Jul 30 | `resolve_dispute` had no explicit weight validation (weight hardcoded 1; check was dead) | Missing guard | Added `weight <= 0 → NotArbitrator` | `test_double_vote_panics` pattern; documented weight=1 accepted risk |
| KI-007 | Medium | Jul 29 | Tie-break in `close_dispute` implicit (0-0 → supporters) | `for > against` strict majority | Documented as spec §5.3 + proptest `tie_breaks_to_supporters` | proptest |
| KI-008 | Low | Jul 29 | `#11 WorkAlreadySubmitted` unreachable (status check #5 fires first) | Guard ordering | Documented accepted; double-submit returns #5 | `test_non_creator_cannot_submit_work_on_used_pool` (#5) |
| KI-009 | Low | Jul 29 | `#31 FeeTreasuryNotSet` unreachable (balance guard #38 fires first) | Guard ordering | Documented accepted; withdraw without balance → #38 | `test_withdraw_fees_no_balance_clean_error` (#38) |
| KI-010 | Low | Jul 30 | Deposit used `InvalidGoal` (#3) for zero amounts instead of a dedicated code | Shared error reuse | Documented; zero deposit → #3 | `test_deposit...` zero paths |
| KI-011 | Info | Jul 30 | `Option<BytesN<32>>` field in `Pool` broke testutils `TryFrom` codegen (SDK 21 limitation) | SDK limitation | Refactored to `work_hash: BytesN<32>` + `work_submitted: bool` (v3 struct) | All tests |
| KI-012 | Info | Jul 30 | `ed25519-dalek` v3 + `soroban-env-host` 21 testutils incompatibility blocked `cargo test` | rand_core 0.10 vs 0.6 mismatch | Pinned `ed25519-dalek = 2.2.0` in dev-deps | — (environment) |
| KI-013 | Info | Jul 30 | Timelock constants hardcoded (24h/48h/7d) made full pause/finalize cycles untestable live | Design | `set_flow_constants()` admin fn with 60s floors + mainnet defaults | `test_compressed_pause_cycle`, `test_compressed_vote_deadline_allows_quick_finalize` |
| KI-014 | 🔴 P4 | — | Arbitrator weight fixed at 1 (not stake-derived) | MVP design | Compute weight from verified funding history (paid-pool supporter sums, capped) | `test_compute_arbitrator_weight` (P4) |
| KI-015 | 🔴 P4 | — | Dispute fee returned to winner uses `try_transfer` (skips on failure) | Robustness choice | Switch to hard `transfer` (atomic revert, no silent fee loss) | `test_dispute_fee_return_reverts_on_failure` (P4) |
| KI-016 | ✅ (v4) | — | Refund loop uses `try_transfer` and skips failed recipients (funds stay in contract) | Robustness choice | `claim_refund(supporter, pool_id)` entry point added in v4 — supporters recover stranded refunds anytime (EXPIRED pools keep non-zero records) | `regress_ki016_claim_refund_full_cycle`, `regress_ki016_claim_refund_rejects_non_expired` |
| KI-017 | ✅ | Aug 1 | **F-401**: `withdraw_fees` never transferred tokens to treasury (bookkeeping only) | Missing token transfer in withdraw path | `withdraw_fees(caller, amount, token)` now transfers contract→treasury; balance-guarded; FeeTotal decremented after transfer | `regress_f401_withdraw_fees_guarded_and_transfers`, `regress_f401_withdraw_fees_transfers_to_treasury` |
| KI-018 | ✅ | Aug 1 | **F-501**: `finalize` did not block DISPUTED/APPEALED pools — settlement could bypass arbitration | Missing status guard in finalize | Added `#41 DisputePending` guard before settlement | `regress_f501_finalize_blocked_during_dispute` |
| KI-019 | ✅ | Aug 1 | **F-101**: creator could deposit + self-approve their own pool | No creator exclusion in `vote` | Added `#40 CreatorCannotVote` guard (creator stake excluded from tally) | `regress_f101_creator_cannot_vote` |
| KI-020 | ✅ | Aug 1 | **F-105**: referral rewards not capped; creator could pre-register supporters and self-credit unbounded bonus | Unlimited reward credit loop | Rewards capped by pool fee (F-105) + reserved from fee before treasury; `register_referral` now requires a real pool (F-104) | `regress_f105_referral_capped_at_fee`, `regress_f105_register_referral_unknown_pool` |
| KI-021 | ✅ | Aug 1 | **F-201**: persistent records got TTL on write only — idle pools >31d could archive funds | No TTL extension on read | Rolling TTL on read paths (`get_pool_internal`, `get_supporter_internal`, `get_supporter_list`, `get_dispute_internal`, `get_vote_list_internal`) | `regress_f201_ttl_refreshed_on_read` |
| KI-022 | ✅ | Aug 1 | **F-301**: `math.rs` proptested but not wired into on-chain paths | Contract inlined math | Settlement routed through `math::settle_fee` / `math::referral_reward` / `math::dispute_fee` | proptest suite (fee/referral/dispute invariants) |
| KI-023 | ✅ | Aug 1 | **F-601**: `appeal_dispute` emitted no event (DISPUTED→APPEALED invisible) | Missing publish | Added `p_appl` topic + `DisputeAppealedEvent` | `regress_f601_appeal_emits_event` |

---

## Infrastructure Issues

| ID | Severity | Date | Description | Fix | Status |
|---|---|---|---|---|---|
| KI-101 | High | Jul 30 | API keys stored in-memory only (lost on restart) | DB-backed store (`api_keys` table, sha256-hashed keys) — P4 in progress | 🔴 |
| KI-102 | Medium | Jul 30 | `ADMIN_KEY` auto-generated when env unset (silent rotation) | Now logs warning + disables admin endpoints (503) | ✅ |
| KI-103 | Low | Jul 30 | OpenAPI spec paths were missing `/api/v1` prefix; top-level security contradicted public reads | Fixed all paths; `security: []` on public GETs | ✅ |
| KI-104 | Low | Jul 30 | Webhook dispatch fire-and-forget (no retry beyond fetch catch) | Retry queue added in P3 (monitor `failed_alerts` table + `flushRetryQueue` worker, 3 attempts w/ backoff) | ✅ |
| KI-105 | Low | Jul 30 | Relayer manage-data value used `slice(0,32)` without padding | Fixed with `padEnd` | ✅ |
| KI-106 | Low | Jul 30 | Relayer tx polling had no backoff | Added exponential backoff (1.5x, max 15s) | ✅ |

---

## How to use this ledger

1. Auditors: verify each ✅ has a passing regression test; challenge each ⚠️.
2. Every NEW finding during B1 must be appended with a new KI-ID.
3. The RFQ (B2) references this ledger as "previously identified & resolved" evidence.
