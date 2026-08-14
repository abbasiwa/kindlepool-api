# Enterprise Build Plan — Contract Verification & Hardening

**Status**: Contract deployed on testnet (`CAMYPBNBBHCQPNXCZICF3TZ7JDTG6B3HZDL7AOTHHWM5DRC3KFY4BG4E`)
**Verified live**: `create`, `get_pool`, `get_fee`
**Requires work**: All other entry points

---

## 1. Entry Point Inventory (18 existing)

| # | Function | Type | Live-Verified | Gap |
|---|---|---|---|---|
| 1 | `create` | Write | ✅ | — |
| 2 | `deposit` | Write | ❌ | Needs token contract |
| 3 | `submit_work` | Write | ❌ | Needs verification |
| 4 | `vote` | Write | ❌ | Needs verification |
| 5 | `finalize` | Write | ❌ | Needs verification |
| 6 | `raise_dispute` | Write | ❌ | Needs verification |
| 7 | `resolve_dispute` | Write | ❌ | Needs verification |
| 8 | `close_dispute` | Write | ❌ | Needs verification |
| 9 | `appeal_dispute` | Write | ❌ | Needs verification |
| 10 | `set_fee` | Write | ❌ | Needs admin model |
| 11 | `get_fee` | Read | ✅ | — |
| 12 | `get_total_fees_collected` | Read | ❌ | Needs verification |
| 13 | `register_referral` | Write | ❌ | Needs verification |
| 14 | `claim_referral_reward` | Write | ❌ | Needs verification |
| 15 | `get_referrals` | Read | ❌ | Needs verification |
| 16 | `get_dispute` | Read | ❌ | Needs verification |
| 17 | `get_arbitrator_votes` | Read | ❌ | Needs verification |
| 18 | `get_pool` | Read | ✅ | — |

## 2. Missing Entry Points (10 required for enterprise grade)

### Critical (must have before mainnet)

| # | Function | Purpose |
|---|---|---|
| 19 | `get_pool_count()` | Expose total pool count (stored but never exposed) |
| 20 | `get_supporter(pool_id, address)` | Per-supporter lookup for dashboard |
| 21 | `get_pools_by_creator(creator)` | Creator portfolio listing |
| 22 | `get_pools_by_supporter(supporter)` | Supporter portfolio listing |
| 23 | `pause()` / `unpause()` / `get_paused()` | **Emergency pause** — planned in M9, never built |
| 24 | `set_fee_treasury()` | Separate treasury setter (currently bundled) |
| 25 | `withdraw_fees(treasury)` | Treasury withdrawal with admin auth |
| 26 | `get_platform_stats()` | Aggregated stats for analytics dashboard |

### Important (launch +1)

| # | Function | Purpose |
|---|---|---|
| 27 | `cancel_pool()` | Creator cancellation before deadline (funds auto-refund) |
| 28 | `set_admin()` / `get_admin()` | Admin/ownership management with two-step transfer |
| 29 | `get_contract_version()` | On-chain metadata for upgradability tracking |

## 3. Missing Security Mechanisms

### 3.1 Emergency Pause (CRITICAL)
- `pause()` — only admin, sets Paused flag
- `unpause()` — only admin
- All write functions check `when_not_paused` first
- Timelock: admin cannot unpause within 48h of pause (prevents instant rug)
- Delayed pause: 24h notice period before pause takes effect (community awareness)

### 3.2 Admin Model (CRITICAL)
Current state: `set_fee` accepts any caller with `require_auth` — **any address can set fees!**
- Add `DataKey::Admin` stored at deploy time (creator of contract)
- Two-step admin transfer: `propose_admin()` → `accept_admin()`
- All admin functions check `caller == admin`

### 3.3 Reentrancy & Overflow Guards
- All storage reads/writes use checked arithmetic (verify each)
- External calls (token transfers) happen LAST in each function (check order)

### 3.4 Edge Cases Not Yet Handled
- `deposit` after `submit_work` — currently blocked? (pool status = AWAITING_VOTE, deposit checks `status != OPEN` → blocked ✅)
- `vote` before work submitted — status check handles ✅
- `finalize` called twice — `AlreadyFinalized` ✅
- `raise_dispute` on paid pool — `PoolNotOpen` ✅
- **MISSING**: `deposit` when `total_deposited + amount` would exceed goal — allowed? (overfunding)
- **MISSING**: duplicate `submit_work` after dispute resolution
- **MISSING**: `close_dispute` with zero votes (tie → falls to supporters — verify intended)

## 4. Test Strategy (Enterprise Grade)

### Phase A — Unit Tests (in-repo)
- Complete `cargo test` suite for all 18+ functions
- **Fix environment first**: `ed25519-dalek` / `soroban-env-host` conflict blocks test compilation
- Target: 95%+ line coverage

### Phase B — Property-Based Tests (proptest)
- Settlement math invariants: `sum(refunds) == total_deposited` always
- Vote weight invariants: `yes + no == total_deposited`
- Fee math: `creator_payout + fee == total_deposited`
- Storage invariants: no state mutation on revert

### Phase C — Live Testnet Integration Tests (THE CORE DELIVERABLE)
Script: `scripts/integration-test.sh` — drives full lifecycle against deployed contract

**Scenario 1 — Happy Path (approve):**
1. Deploy mock USDC token (SAC)
2. Mint tokens to creator + 3 supporters
3. `create` pool (goal 1000 USDC)
4. `deposit` x3 (400 + 350 + 250 = 1000)
5. `submit_work` by creator
6. `vote` approve x3 (token-weighted)
7. `finalize` → creator receives 995 (0.5% fee), treasury receives 5
8. Verify balances exactly

**Scenario 2 — Rejection (refund):**
1. `create` pool, deposit, submit
2. `vote` reject majority
3. `finalize` → all supporters refunded exactly

**Scenario 3 — Goal not met (expiry):**
1. `create` pool (7-day deadline)
2. Deposit partial (300/1000)
3. Wait/travel time past deadline
4. `finalize` → pro-rata refunds

**Scenario 4 — Dispute lifecycle:**
1. Pool rejected by vote
2. Creator `raise_dispute` (fee = 1% of goal)
3. Arbitrators `resolve_dispute` x3 (2 for creator, 1 against)
4. `close_dispute` → creator paid minus fee, dispute fee returned
5. `appeal_dispute` by losing side → doubled fee

**Scenario 5 — Referral:**
1. `register_referral` (referrer → supporter)
2. Deposit by referee, approve, finalize
3. `claim_referral_reward` → 0.5% of supporter contribution

**Scenario 6 — Fee administration:**
1. `set_fee(500)` → verify 5% deduction
2. `set_fee(0)` → verify no deduction
3. `withdraw_fees` → treasury balance empties

### Phase D — Fuzz Testing
- Random inputs to all write functions
- Random sequence of operations (100+ step chains)
- Ledger timestamp manipulation (past/future deadlines)
- Amount edge values (0, negative, i128::MAX, 1 stroop)

### Phase E — Security Audit (external)
- After Phases A-D pass, engage: OtterSec / Cantina / Trail of Bits
- Fix all Critical/High findings
- Re-audit + sign-off

## 5. Execution Order

```
Step 1  Fix test environment (ed25519/ethnum conflict)
Step 2  Add 10 missing entry points + admin model + pause
Step 3  Fix set_fee authorization (admin-only)
Step 4  Write unit tests (95% coverage target)
Step 5  Write proptest suite
Step 6  Deploy mock USDC token to testnet
Step 7  Write + run integration test script (6 scenarios)
Step 8  Fuzz testing
Step 9  External audit
Step 10 Mainnet deploy (gated on Steps 1-9 all green)
```

## 6. Definition of Done (for "zero flaws confirmed")

- [ ] All 29 entry points live-tested on testnet
- [ ] Unit tests pass with 95%+ coverage
- [ ] Property-based tests pass (10k+ random cases)
- [ ] Integration tests pass for all 6 scenarios
- [ ] Fuzz testing finds zero critical issues
- [ ] External audit report with zero Critical/High findings
- [ ] Pause + admin mechanisms tested (including timelock)
- [ ] Full lifecycle verified against live contract on testnet
