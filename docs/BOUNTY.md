# Bug Bounty Program

## Scope

Smart contracts deployed on Stellar Soroban mainnet are in scope.
Testnet contracts are out of scope unless they contain the same code as mainnet.

### In Scope

| Component | Criticality |
|---|---|
| On-chain pool contracts (all public functions) | Critical |
| Platform API | High |
| Platform services | High |
| Front-end wallet integration | Medium |

### Out of Scope

- The Stellar network itself (report to the Stellar Development Foundation)
- Third-party dependencies (report to the respective maintainers)
- Social engineering attacks
- Denial of service attacks that do not exploit platform logic

---

## Reward Tiers

| Severity | Max Reward | Requirements |
|---|---|---|
| **Critical** | $10,000 | Direct loss of user funds, unauthorized transfers, or permanent freeze |
| **High** | $5,000 | Logic errors causing incorrect payouts, voting manipulation, or access-control bypass |
| **Medium** | $1,000 | Data leaks, front-end XSS, or key exposure |
| **Low** | $500 | Minor information disclosure or input-validation gaps |
| **Informational** | $100 | Best-practice violations or code-quality issues |

---

## Rules

1. **One vulnerability per report** — submit separate reports for separate issues.
2. **No testing on mainnet** — use testnet for all exploit testing.
3. **No social engineering** — do not attempt to phish team members.
4. **No denial of service** — do not attempt to crash the platform.
5. **Responsible disclosure** — 90-day embargo before public disclosure.
6. **No duplicates** — the first valid report receives the reward.

---

## Submission Process

1. Email: `security@kindlepool.app`
2. Expected response: within 48 hours
3. Expected fix timeline:
   - Critical: 7 days
   - High: 14 days
   - Medium: 30 days
   - Low: 90 days

---

## Previous Reports

*This section will be populated as reports are resolved.*
