# KindlePool — Remaining Work & Server-Deletion Checklist

Last updated: 2026-08-01 · Repo: `abbasiwa/kindlepool` (branch `main`, HEAD `daafd22`) · Pushes as `mikwansa <nekwasar@moistello.com>`

---

## 0. BEFORE DELETING THIS SERVER (do these FIRST, every item is required)

| # | Action | Status |
|---|---|---|
| 1 | **Download `/tmp/opencode/kindlepool-backup/`** — contains: `testnet-credentials.env` (deployer secret + recovery phrase), `identity/*.toml` (5 test accounts: kindlepool-deployer, attacker, sup-b, sup-c, usdc-issuer — **no other copy of these secrets exists**), `contract-ids.txt` (all deploy IDs) | 🔴 MUST |
| 2 | 🔴 **SECURITY: `secure/testnet-credentials.env` was committed to GitHub history** (until `960ebd1`). Purged from all history with `git-filter-repo` + force-push on 2026-08-01. **Assumptions to verify:** repo is public → GitHub secret-scanning may have flagged it; consider **rotating the testnet account** (or burn it — testnet only). Keep `secure/` out of git (now gitignored). | ⚠️ verify |
| 3 | Nothing else uncommitted (all pushed at `daafd22`) | ✅ |
| 4 | `target/` (3.7 GB) + `node_modules/` — regenerable, no backup needed | ✅ skip |
| 5 | A3 live suite on **v10** `CCRSLQSTTVMLUIU3I3TU2GRUFPUNCPGFLSFOTDWEVUF65V6PQBLOGNT2` was **NOT completed** (run aborted on user request). The last clean full run (v9 `CATIHG5T5DV2K5SQQEGA5UN22NXHYD2JRSEVS6OPUQW6QC2G2DQZPAFQ`) was 52/53 — the single fail was a test-check math bug already fixed in `daafd22`. **On the new machine: deploy fresh → init → full `npx tsx tests/live/src/run.ts` → expect 53/53.** | ⚠️ redo |

---

## 1. P1 — Verification & docs (next session)

- [ ] Fresh deploy + full A3 live run (expect 53/53, per §0.5). Use `set_flow_constants(120,60,60)` via S10 (now built in).
- [ ] Update `docs/SPEC.md`: creator excluded from vote (#40), finalize blocked on DISPUTED/APPEALED (#41), `withdraw_fees(caller, amount, token)` new ABI, referral rewards capped by pool fee + reserved from fee before treasury, `claim_refund` entry point, TTL-on-read behavior, `p_appl`/`p_rclm` events, CONTRACT_VERSION 4.
- [ ] Update `docs/known-issues.md`: add KI-017 (F-401) … KI-023 (F-501, F-101, F-105, F-201, F-301, F-601, KI-016 done) — mark ✅ fixed + regression test refs. KI-014/015/101/104 remain ⚠️.
- [ ] Update `docs/coverage-report.md`: pool.rs 95.66% lines / 100% fns, TOTAL 98.06%, lib.rs 100%, 84/84 tests.
- [ ] Update `docs/audit/report-v1.md`: F-401/F-501/F-101/F-105/F-201/F-301/F-601 → FIXED (commit `7b7340b`); remaining: infra findings + F-201 residual (view-only reads don't extend TTL).
- [ ] Regenerate/refresh `docs/verification-report.json` (stale contract ID, pre-dates fixes).
- [ ] `scripts/verify-matrix.sh` CT → latest deploy (currently v10).

## 2. P2 — B2 RFQ (not started)

- [ ] `docs/RFQ.md`: 9 sections (scope incl. contract 37+3 entry points + Phase-2 infra; firms OtterSec/Cantina/Trail of Bits/Halborn/Quantstamp; weight-40/25/15/10/10 scorecard; 10-day response window). Reference `docs/audit/report-v1.md` as internal v1 evidence.

## 3. P3 — Infra fixes from audit (DONE 2026-08-14)

All infra findings implemented (basic) with vitest coverage in each service. Upgrade paths tracked as GitHub issues #2–#5.

- [x] **F-701 High** — indexer event scval parsing → `src/scval.ts` (`decodeEvent` via `scValToNative`; fields from value map). Tests: `test/scval.test.ts`
- [x] **F-702** — `total_supporters` overcount → `upsertSupporter` returns created-flag; increment only on first deposit. Tests: `test/handlers.test.ts`
- [x] **F-703** — all 20 topics handled + `contract_state`/`arbitrator_votes`/`referrals` tables. Tests: `test/handlers.test.ts`
- [x] **F-704** — persisted `lastLedger` cursor (`checkpoints` table). Tests: `test/handlers.test.ts`
- [x] **F-705** — waived for MVP; documented in `services/indexer/README.md` (multi-contract composite PK = upgrade, issue #3)
- [x] **F-801 High** — relayer submits the user's signed tx via fee-bump. Tests: `test/relay.test.ts`
- [x] **F-802** — `/relay` allowlist (`KINDPOOL_RELAYER_ALLOWLIST`). Tests: `test/relay.test.ts`
- [x] **F-803** — `source_address` validated against tx source. Tests: `test/relay.test.ts`
- [x] **F-804** — fee + TTL configurable via env. Tests: `test/relay.test.ts`
- [x] **F-901** — notifier subscribe requires signed ownership proof; `/notify` requires API key; rate-limit. Tests: `test/notifier.test.ts`
- [x] **F-902** — subscriptions persisted in SQLite (`src/store.ts`). Tests: `test/notifier.test.ts`
- [x] **F-1001** — monitor health/anomalies persisted per tick (`src/persistence.ts`). Tests: `test/monitor.test.ts`
- [x] **F-1002** — deeper anomaly checks (fee_spike, paused-with-activity, disputes_pending). Tests: `test/monitor.test.ts`
- [x] **F-1003** — webhook retry queue (`failed_alerts`) + flush worker. Tests: `test/monitor.test.ts`

**Status**: 37 vitest tests passing across 4 services; all typecheck clean.

## 4. P4 — KI backlog (documented, pending)

- [ ] KI-101: API keys → DB-backed store (indexer).
- [ ] KI-104: webhook retry queue (notifier/monitor).
- [ ] KI-014/015: mainnet arbitrator weight from verified funding; dispute-fee return hardening.
- [ ] KI-016: `claim_refund` DONE in contract (v4) — verify live on new deploy.

## 5. P5 — Mainnet release gate

- [ ] Set mainnet flow constants (604800/86400/172800) + treasury + fee.
- [ ] Rotate deployer account (testnet secret was exposed in git history — do NOT reuse).
- [ ] Professional firm audit per B2 RFQ; address findings; re-run A3 + coverage.
- [ ] Final sign-off + tag.

---

## Key facts to remember

- **Contract versions**: CONTRACT_VERSION 3 = A3-green reference `CBFW4U4HO6Z6RPRRNPWA2MWPRXJSSR2MGK2UOQTDDZEZQPOWUIKDKY7W`; v4 = fix batch + KI-016 (wasm in repo). Deploys: v7 `CBGULQ5…`, v8 `CCUMG3S…`, v9 `CATIHG5…`, v10 `CCRSLQ…` (recorded in backup `contract-ids.txt`).
- **Tests**: 84/84 unit + proptest; coverage TOTAL 98.06% (pool.rs 95.66% lines / 100% fns).
- **Tests MUST run on a fresh contract** (S15 leaves funds in the contract; S8 asserts empty-contract behavior).
- Push identity: `mikwansa` — NEVER `nekwasar` unless explicitly instructed.
- Live credentials: `/tmp/opencode/kindlepool-backup/testnet-credentials.env` (gitignored).
