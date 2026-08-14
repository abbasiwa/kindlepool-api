# Bug Bounty Program

## Scope

Smart contracts deployed on Stellar Soroban mainnet are in scope.
Testnet contracts are out of scope unless they contain the same code as mainnet.

### In Scope

| Component | Criticality |
|---|---|
| `sponsor_pool` contract (all public functions) | Critical |
| Indexer REST API | High |
| Relayer service | High |
| Front-end wallet integration | Medium |

### Out of Scope

- Stellar network itself (report to Stellar Development Foundation)
- Third-party dependencies (report to respective maintainers)
- Social engineering attacks
- Denial of service attacks that do not exploit contract logic
- Already known issues (see audit reports)

---

## Reward Tiers

| Severity | Max Reward | Requirements |
|---|---|---|
| **Critical** | $10,000 | Direct loss of user funds, unauthorized token transfers, or permanent contract freeze |
| **High** | $5,000 | Logic errors causing incorrect payouts, voting manipulation, bypass of access controls |
| **Medium** | $1,000 | Data leaks, front-end XSS that could lead to wallet compromise, API key exposure |
| **Low** | $500 | Minor information disclosure, lack of input validation on non-critical paths |
| **Informational** | $100 | Best practice violations, code quality issues, outdated dependencies |

---

## Rules

1. **One vulnerability per report** — submit separate reports for separate issues
2. **No testing on mainnet** — use testnet for all exploit testing
3. **No social engineering** — do not attempt to phish team members
4. **No denial of service** — do not attempt to crash the contract or API
5. **Responsible disclosure** — 90-day embargo before public disclosure
6. **No duplicates** — first valid report receives the reward
7. **Eligibility** — you must not be a resident of a sanctioned country or an employee of KindlePool

---

## Submission Process

1. Email: `security@kindlepool.dev`
2. PGP key: [available on keyserver] (optional but recommended)
3. Expected response: within 48 hours
4. Expected fix timeline:
   - Critical: 7 days
   - High: 14 days
   - Medium: 30 days
   - Low: 90 days

---

## Previous Reports

*This section will be populated as reports are resolved.*

| ID | Severity | Description | Reward | Researcher |
|---|---|---|---|---|
| — | — | — | — | — |
