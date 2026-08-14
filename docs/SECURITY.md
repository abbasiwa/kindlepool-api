# Security Audit Framework

## Audit Scope

The following components are in scope for external security audit:

### 1. Soroban Smart Contract (`contracts/sponsor-pool/`)

**Critical paths:**
- `deposit()` — token transfer and accounting
- `finalize()` — payout and refund logic, pro-rata distribution
- `vote()` — token-weighted voting, double-vote prevention
- `raise_dispute()` — fee collection, dispute creation
- `close_dispute()` — vote tallying, payout execution, fee return
- `submit_work()` — access control, state transition

**Invariants to verify:**
- Total deposited tokens always equal sum of supporter balances
- Pool status transitions follow correct order (Open → AwaitingVote → Paid/Expired/Disputed)
- No double-finalize, no double-vote, no double-withdraw
- Pro-rata refunds distribute exactly the pool balance
- Dispute fee returned to winner, not lost or duplicated

### 2. Indexer + API (`services/indexer/`)

- API key authentication bypass
- Rate limiting effectiveness
- SQL injection in query parameters
- Webhook HMAC signature verification

### 3. Relayer (`services/relayer/`)

- Fee-bump transaction validation
- Relayer key protection
- Spam prevention

### 4. Front-end (`web/`)

- Wallet integration (Freighter message signing)
- IPFS upload security
- XSS prevention in pool metadata

---

## Audit Firms

Recommended Soroban/Stellar-specialized auditors:

| Firm | Specialty | Contact |
|---|---|---|
| **OtterSec** | Soroban, Solana, Rust | https://osec.io |
| **Cantina** | Stellar, Soroban, audit competitions | https://cantina.xyz |
| **Trail of Bits** | Rust, smart contracts | https://trailofbits.com |
| **Halborn** | Blockchain, DeFi | https://halborn.com |

---

## Pre-Audit Checklist

- [ ] All functions have complete test coverage (>90%)
- [ ] Property-based tests for settlement math
- [ ] Fuzz testing for all public entry points
- [ ] Static analysis with `cargo audit` (dependency vulnerabilities)
- [ ] `cargo clippy` with zero warnings
- [ ] All TODO/FIXME comments resolved
- [ ] Documentation of each public function's pre/post conditions
- [ ] Formal specification of state machine (status transitions)
- [ ] Gas/storage cost analysis for all functions
- [ ] Mainnet deploy simulation on testnet-first

---

## Timeline

```
Week 1-2:  Internal review + static analysis
Week 3-4:  External audit (parallel with fix window)
Week 5:    Fix all Critical/High findings
Week 6:    Re-audit + sign-off
```

---

## Responsible Disclosure Policy

If you find a vulnerability:

1. **Do NOT** post it publicly or exploit it
2. Email: `security@kindlepool.dev`
3. Include: description, steps to reproduce, impact, suggested fix
4. Expect acknowledgment within 48 hours
5. We commit to fixing Critical issues within 7 days

---

## Bug Bounty

See [BOUNTY.md](BOUNTY.md) for rewards and scope.
