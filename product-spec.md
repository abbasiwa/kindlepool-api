# KindlePool — Product Specification

## Overview

KindlePool is a decentralized micro-sponsorship platform where supporters fund **specific creative work** — not creators. Money pools trustlessly on Stellar Soroban, releases to the creator only if quality thresholds are met, and automatically refunds supporters if the goal fails or work is rejected.

**Tagline**: Fund the work, not the creator.

---

## Core Problem

Existing creator funding models are broken:

| Model | Problem |
|---|---|
| Ads | Intrusive, low revenue, platform-controlled |
| Patreon/Substack | Pays the **person** monthly, not the **work**. 5-12% fees. |
| Kickstarter | All-or-nothing, months of waiting, 5-10% + payment fees. Not for small, quick projects. |
| Direct donations | No accountability — creator takes money and delivers nothing. No recourse. |

**Gap**: There's no way to micro-fund a specific piece of work with **conditional, code-enforced payout** and **near-zero fees**.

---

## Why Stellar (and only Stellar)

| Requirement | Stellar | Ethereum | Solana |
|---|---|---|---|
| Micro-pool ($5-100) viable | ✅ ~$0.0001/tx | ❌ $3-8 gas kills micro | ⚠️ $0.01-0.05 adds up |
| Pro-rata refunds to many | ✅ Soroban batch | ❌ Gas per refund | ⚠️ Complex |
| Native asset support | ✅ Built-in, free | ❌ ERC-20 deploy costs | ⚠️ SPL complexity |
| No MEV (fair votes) | ✅ No MEV | ❌ Frontrunning risk | ⚠️ Possible |
| Platform fee | ✅ ~0% (network only) | ❌ 10-30% implicit | ⚠️ Modest |

For a **$10 pool**, Ethereum gas is 30-80% overhead. Stellar is **< 0.1%**. Pools of any size are viable only on Stellar.

---

## Product Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Layer                           │
│  Web App / Mobile App / Wallet (direct contract interaction) │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                     API / Indexer Layer                      │
│  AI recommendation engine │ Pool indexer │ Activity feeds    │
│  (centralized for UX — never touches funds)                  │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  Soroban Smart Contract Layer                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ Pool Factory │  │ Pool Instance│  │ Supporter Voting   │   │
│  │ (create pools)│  │ (funds, vote)│  │ (token-weighted)  │   │
│  └─────────────┘  └──────────────┘  └───────────────────┘   │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  Stellar Network                             │
│  Native assets (XLM, USDC, any) │ No MEV │ ~5s finality     │
└─────────────────────────────────────────────────────────────┘
```

### Decentralization Boundary

| Component | Decentralized? | Notes |
|---|---|---|
| Pool creation & funding | ✅ Full | Soroban contract — unstoppable |
| Fund custody | ✅ Full | Tokens in contract, not humans |
| Voting & payout | ✅ Full | On-chain tally, code-enforced |
| Refunds | ✅ Full | Permissionless `finalize()` |
| AI recommendations | ❌ Centralized | Server — never touches funds |
| Front-end UI | ❌ Centralized | Any interface can interact |
| Content storage | ⚠️ Hybrid | IPFS/Arweave for content, hash on-chain |

The **economic layer** is fully trustless. Users can interact via any wallet without the front-end.

---

## User Flows

### Flow 1: Creator Creates a Pool

1. Creator connects wallet (Freighter, xBull, etc.)
2. Fills form: goal amount, deadline, token, description, reference image/preview (IPFS)
3. Signs `create()` transaction → Soroban contract creates pool, emits event
4. Pool appears on the discover page

### Flow 2: Supporter Funds a Pool

1. Supporter browses pools (AI recommendations or search)
2. Clicks "Fund" — enters amount
3. Signs `deposit()` transaction → tokens transfer to contract
4. Supporter sees their deposit + pending share

### Flow 3: Creator Submits Work

1. Creator uploads final work → stored on IPFS
2. Signs `submit_work()` with content hash → stored on pool
3. Voting window opens (configurable, e.g., 7 days)
4. Supporters get notified

### Flow 4: Supporters Vote

1. Supporters review the work
2. Vote "Approve" or "Reject" — weight is proportional to deposit
3. If weighted approval > threshold (default 60%) → pool is **funded**
4. If not → pool is **expired** → auto refunds

### Flow 5: Settlement

**If approved:**
- Anyone calls `finalize()` after deadline
- Contract transfers pool balance to creator minus network fees
- Supporters receive optional "badge" tokens representing their contribution

**If rejected or goal not met:**
- Anyone calls `finalize()` after deadline
- Contract distributes pro-rata refunds to all supporters
- No action needed from supporters — funds return automatically

---

## Soroban Contract Design

### Data Model

```rust
struct Pool {
    creator: Address,
    token: Address,
    goal: i128,
    total_deposited: i128,
    deadline: u64,
    status: u32,        // 0=Open, 1=Funded, 2=Paid, 3=Expired
    work_hash: Option<BytesN<32>>,
    yes_votes: i128,
    no_votes: i128,
    metadata_hash: BytesN<32>,
    vote_deadline: u64,
}

struct Supporter {
    amount: i128,
    voted: bool,
}

enum DataKey {
    Pool(u32),
    PoolCount,
    Supporter(u32, Address),
}
```

### Public Functions

| Function | Description |
|---|---|
| `create(creator, goal, deadline, token, metadata_hash)` | Create a new pool. Returns pool_id. |
| `deposit(pool_id, supporter, amount)` | Fund a pool. Tokens held by contract. |
| `submit_work(pool_id, work_hash)` | Creator submits final work. Opens voting. |
| `vote(pool_id, voter, approve)` | Token-weighted vote on quality. |
| `finalize(pool_id)` | Settle pool — payout or refund. Permissionless. |
| `get_pool(pool_id) -> Pool` | View pool state. |

### Settlement Logic

```
function finalize(pool_id):
    pool = load(pool_id)
    
    if pool.total_deposited >= pool.goal:
        if pool.yes_votes >= pool.no_votes:
            // Approved — pay creator
            transfer(pool.token, pool.creator, pool.total_deposited)
            pool.status = PAID
        else:
            // Rejected — refund all
            for each supporter:
                transfer(pool.token, supporter, supporter.amount)
            pool.status = EXPIRED
    else:
        // Goal not met — refund all
        for each supporter:
            transfer(pool.token, supporter, supporter.amount)
        pool.status = EXPIRED
```

---

## Token Economics (Non-Financial Utility Tokens)

Supporters receive **badge tokens** — native Stellar assets minted per pool.

- **Free to issue** — Stellar native assets have zero minting cost
- **Free to transfer** — via built-in DEX
- **Represent contribution** — badge supply = pool goal, allocated pro-rata to supporters
- **Collectible** — badges can be displayed, traded, or used for future pool priority

No speculation, no trading volume targets — pure utility as proof of support.

---

## AI Integration

| Feature | Description | Decentralized? |
|---|---|---|
| **Recommendations** | "People who funded X also funded Y" — collaborative filtering | No |
| **Work quality pre-check** | AI scans submitted work for plagiarism, resolution, coherence before vote | No |
| **Goal feasibility** | Predicts likelihood of reaching goal based on early deposit patterns | No |
| **Trending pools** | Real-time ranking of active pools gaining momentum | No |
| **Supporter insights** | "You fund illustration pools most" — personalized activity summaries | No |

AI runs server-side with open models (fine-tuned Llama/Mistral for text analysis, CLIP for image quality). Never controls funds or votes.

---

## Roadmap

### Phase 1 — Core Protocol (now)
- [ ] Soroban contract: pool create, deposit, submit, vote, finalize
- [ ] Tests for all contract functions
- [ ] Basic front-end (create pool, browse, fund)
- [ ] Contract deployment to Stellar testnet

### Phase 2 — Trust Layer
- [ ] Token-weighted voting verified on multiple test scenarios
- [ ] Pro-rata refund gas optimization
- [ ] Supporter badge token minting
- [ ] Security audit

### Phase 3 — AI + Discovery
- [ ] AI recommendation engine
- [ ] Work quality pre-check
- [ ] Trending/feed algorithm
- [ ] Mobile-first responsive UI

### Phase 4 — Mainnet Launch
- [ ] Deploy to Stellar mainnet
- [ ] Bug bounty program
- [ ] Creator onboarding campaigns
- [ ] Open-source all components

---

## Competitive Landscape

| Product | Model | Fees | Conditional Payout? | Decentralized? |
|---|---|---|---|---|
| Patreon | Monthly sub | 5-12% | ❌ | ❌ |
| Kickstarter | All-or-nothing | 5-10% | ⚠️ (pledge, not vote) | ❌ |
| Ko-fi | Donation | 0% (payment fees) | ❌ | ❌ |
| **KindlePool** | Pool per work | **~0%** | ✅ Code-enforced | ✅ On Stellar |

No competitor offers conditional, code-enforced payout for specific work with near-zero fees.

---

## Summary

KindlePool is:
- **A problem** — creators need project-based funding with accountability
- **A mechanism** — Soroban smart contracts hold funds, enforce conditions, settle trustlessly
- **A differentiator** — only Stellar makes micro-pools economically viable
- **A principle** — fund the work, not the creator
