# KindlePool — Development Milestones

> **Tagline**: Fund the work, not the creator.
> **Stack**: Stellar Soroban (contract) + React/PWA (front-end) + Python/Node (API/indexer) + AI services
> **Design**: Neo-Brutalism Lite, Organic Modernism, Tactile Minimal UI. Cream aesthetics. No cyberpunk, no stark grids, no heavy shadows.

---

## Phase 0 — Foundation Layer (Contract Core)

**Goal**: A complete, working Soroban contract with all core logic implemented end-to-end. Deployed and verified on Stellar testnet.

### 0.1 — Data Model + Storage Layout
- Define `Pool` struct: creator, token, goal, total_deposited, deadline, status (Open/Funded/Paid/Expired), work_hash, yes_votes, no_votes, metadata_hash, vote_deadline
- Define `Supporter` struct: amount, voted
- Define `DataKey` enum: Pool(u32), PoolCount, Supporter(u32, Address)
- Use instance storage for pools and supporter data
- Verify storage layout is efficient (minimal reads/writes per function)

### 0.2 — `create()` Function
- Increment global pool counter
- Validate: goal > 0, deadline > current ledger timestamp, metadata_hash non-empty
- Store new Pool with status = Open
- Emit `PoolCreated` event with pool_id, creator, goal, deadline, token
- Return pool_id

### 0.3 — `deposit()` Function
- Validate: pool exists, pool status is Open, deadline not passed, amount > 0
- Transfer tokens from supporter to contract using token `Client::transfer`
- Update pool.total_deposited
- Update/create Supporter record (accumulate amount)
- Emit `Deposited` event with pool_id, supporter, amount
- If total_deposited >= goal after deposit, emit `GoalReached` event (status stays Open until vote)

### 0.4 — `submit_work()` Function
- Creator-only guard: verify caller matches pool.creator
- Validate: pool status is Open, work not already submitted
- Store work_hash on pool
- Set vote_deadline (e.g., 7 days from now)
- Update pool status to AwaitingVote (new status value 4)
- Emit `WorkSubmitted` event with pool_id, work_hash, vote_deadline

### 0.5 — `vote()` Function
- Validate: pool status is AwaitingVote, vote_deadline not passed, caller is a supporter (has deposited), supporter has not already voted
- Token-weighted: vote weight = supporter's deposited amount
- Update pool.yes_votes or pool.no_votes accordingly
- Mark supporter as voted
- Emit `VoteCast` event with pool_id, voter, approve, weight

### 0.6 — `finalize()` Function
- Permissionless — anyone can call after vote_deadline or pool deadline
- Three settlement branches:
  - **Goal met + approved** (total_deposited >= goal AND yes_votes > no_votes): Transfer full pool to creator. Emit `PoolPaid`. Mint supporter badges (if implemented).
  - **Goal met + rejected** (total_deposited >= goal AND yes_votes <= no_votes): Pro-rata refund to all supporters. Emit `PoolRefunded`.
  - **Goal not met** (total_deposited < goal AND deadline passed): Pro-rata refund to all supporters. Emit `PoolExpired`.
- Batch pro-rata refund: iterate supporters, transfer each their share back. If one transfer fails, continue (skip bad addresses).
- Update pool.status to Paid or Expired

### 0.7 — Full Test Suite
- Unit tests for each function (success paths)
- Integration test for full lifecycle: create → deposit (multiple supporters) → submit work → vote (approve) → finalize → verify creator received funds
- Integration test for rejection path: vote (reject) → finalize → verify supporters refunded
- Integration test for expiry path: create → deposit (below goal) → wait deadline → finalize → verify refund
- Edge cases: duplicate vote rejected, double finalize no-op, deposit after deadline rejected, submit work by non-creator rejected, zero-amount deposit rejected, pool not found errors

### 0.8 — Testnet Deploy
- Build contract for WASM target
- Deploy to Stellar testnet using `soroban-cli`
- Verify all functions via SDK calls
- Document contract address + deploy parameters

---

## Milestone 1 — Indexer + REST API

**Goal**: Off-chain indexer that watches contract events and serves queryable pool data via REST API.

### 1.1 — Event Listener
- Connect to Stellar testnet via Horizon/RPC
- Subscribe to contract events: PoolCreated, Deposited, WorkSubmitted, VoteCast, PoolPaid, PoolRefunded, PoolExpired, GoalReached
- Process events sequentially, handle reorgs (use ledger sequence)

### 1.2 — Database Schema + Indexer Writes
- Tables: `pools`, `supporters`, `votes`, `events`
- Schema optimized for API query patterns (status filters, date ranges, creator/supporter lookups)
- Indexer writes events to DB, updates aggregate state (pool total, supporter balance)

### 1.3 — REST Endpoints
- `GET /api/v1/pools` — list pools with filters (status, token, creator, page, limit)
- `GET /api/v1/pools/:id` — single pool detail with full state
- `GET /api/v1/pools/:id/supporters` — supporter list with amounts and vote status
- `GET /api/v1/supporters/:address/pools` — pools a user has funded
- `GET /api/v1/creators/:address/pools` — pools a user has created

### 1.4 — Pagination + Filtering + Sorting
- Cursor-based pagination (for real-time feeds) + offset-based (for dashboards)
- Filters: status, token type, date range, goal range
- Sort: newest, most funded (highest total), ending soon (nearest deadline), trending (deposit velocity)

### 1.5 — Caching + Rate Limiting
- Redis cache for frequent queries (pool list, popular pools)
- Cache invalidation on new event processing
- Rate limiting per IP (100 req/min for unauthenticated, 1000 req/min for API keys)
- Graceful degradation: stale cache served if indexer is behind

---

## Milestone 2 — Design System (UI Foundation)

**Goal**: Define the complete visual identity, component library, and theme engine before any front-end code. Every screen from M3 onward uses this system.

### 2.1 — Brand Identity
- **Color palette**: Cream base (#FFF8F0, #FAF0E6, #F0E6D8), warm accent (#C4956A, #D4A574, #B8845A), muted secondary (#8A7A6A, #6B5D50), deep text (#2D2520, #1A1614)
- **Typography**: Rounded sans-serif primary (Nunito, Quicksand, or Plus Jakarta Sans), readable serif secondary for quotes/descriptions
- **Logo**: Simple mark — two overlapping soft circles forming a pool ripple + spark (kindle). Cream + warm palette
- **Icon style**: Line-based, rounded caps, 2px stroke, consistent with organic aesthetic
- **Spacing scale**: 4-8-12-16-24-32-48-64-96. Consistent rhythm across all surfaces

### 2.2 — Component Library
- **Buttons**: Tonal fill (cream/warm), soft rounded (12px radius), micro-lift (2px translateY) on hover, subtle scale on press. Active state with darker fill. Disabled state with reduced opacity.
- **Cards**: Cream background, soft rounded (16px radius), very subtle border (#E8D5C4). Hover: micro-lift (3px), slightly warmer background. No box-shadow — instead use layered background technique (card on slightly darker surface).
- **Inputs**: Cream fill with warm border (#D4C5B5). Focus: slightly thicker border + warm glow (no ring/outline). Rounded (10px). Placeholder in muted tone.
- **Modals**: Centered card with backdrop blur (#000 20%). Soft enter/exit animation (scale 0.95→1 + fade). Cream background, rounded top corners (20px).
- **Progress bar**: Warm gradient fill (C4956A → D4A574), rounded caps, animated width on update. Track in muted cream (#E8D5C4).
- **Tabs/Pills**: Active pill in warm accent, inactive in cream with muted text. Rounded (20px). Smooth slide indicator.
- **Toast/Alert**: Slide-in from top. Cream background with warm left border. Icon + message. Auto-dismiss with progress bar. Error: soft red-warm tint.
- **Dropdown/Select**: Cream trigger with chevron. Expanded panel with option list. Selected option highlighted in warm. Smooth expand animation.
- **Skeleton loader**: Shimmer animation using warm gradient (cream → warm → cream). Matches card/input shapes exactly.

### 2.3 — Theme Engine
- CSS custom properties for everything: `--color-bg`, `--color-surface`, `--color-accent`, `--color-text`, `--radius-sm/md/lg`, `--shadow-sm/md/lg` (subtle), `--transition-fast/normal/slow`
- **Light mode**: Cream backgrounds, warm accents, muted text on cream
- **Dark mode**: Deep warm backgrounds (#1A1614, #2D2520), cream text (#E8DDD0), warm accents (#D4A574). Same component shapes — only colors invert.
- Theme switcher with smooth crossfade transition (300ms)
- Persist preference in localStorage + respect `prefers-color-scheme`
- All components consume custom properties — one source of truth

### 2.4 — Animation System
- **Prebuilt transitions**: `fade-in` (opacity 0→1, 300ms), `slide-up` (translateY 20→0, 400ms), `scale-in` (scale 0.95→1, 300ms), `slide-in-right` (translateX 100→0, 350ms)
- **Micro-interactions**: Button press (scale 0.97, 100ms), card hover (translateY -3px, 200ms), toast enter (slide-in + fade, 300ms), tab switch (slide indicator, 250ms), modal open (scale + backdrop fade, 300ms)
- **Page transitions**: Fade + slight slide between routes (300ms)
- **Loading states**: Skeleton shimmer (1.5s cycle), pulse on live data refresh
- **Scroll-triggered**: Elements fade-in on scroll using Intersection Observer
- **Reduced motion**: Respect `prefers-reduced-motion` — disable all animations except opacity fades, scale micro-interactions
- **Library**: Framer Motion for complex sequences, CSS transitions for micro-interactions, CSS keyframes for shimmer/pulse

### 2.5 — PWA Shell + Browser UI
- **Manifest**: `theme_color: #FFF8F0` (light) or `#1A1614` (dark), `background_color` matching, `display: standalone`, status bar style matching theme
- **Meta tags**: `theme-color` meta tag updating on theme switch, `apple-mobile-web-app-status-bar-style` matching cream
- **Service worker**: Cache-first strategy for static assets, network-first for API. Offline fallback page in cream style.
- **Splash screen**: Cream background with logo + subtle animation, generated via PWA asset generator
- **Install prompt**: Custom in-app prompt (not browser default) styled as cream card with warm accent button

### 2.6 — Typography + Spacing
- `clamp()` for fluid type: `--text-sm: clamp(0.875rem, 0.8rem + 0.25vw, 1rem)` etc.
- Headings: rounded sans-serif, bold weight (700-800), tight tracking (-0.01em)
- Body: 400 weight, 1.6 line-height, comfortable measure (60-75ch)
- All spacing uses the scale (4/8/12/16/24/32/48/64/96) — no arbitrary values
- Consistent rhythm: `margin-bottom` on all block elements follows spacing scale

---

## Milestone 3 — Web App MVP (PWA)

**Goal**: Fully functional web app with wallet integration, pool CRUD, and all core flows. Styled with design system from M2. PWA-ready.

### 3.1 — App Scaffold
- Vite + React + TypeScript + React Router
- Design system applied as global CSS + component library
- PWA manifest + service worker from M2 integrated
- Theme switcher wired and persisted
- Animation system (Framer Motion) set up
- Error boundary, loading shell, 404 page

### 3.2 — Wallet Integration
- Freighter SDK: connect, disconnect, get public key, sign + submit transactions
- xBull SDK: same flows (fallback if Freighter not installed)
- Abstracted wallet provider: unified interface for both wallets
- Wallet connection UI: cream card modal with wallet options, animated
- Account display: truncated address with copy button, balance display (native token)
- Auto-disconnect handling + reconnect on page load

### 3.3 — Pool Creation Flow
- Multi-step form with step indicator (animated bar or numbered dots)
- Step 1: Project details (title, description, category tag, cover image upload to IPFS)
- Step 2: Funding parameters (goal amount, deadline picker with min/max validation, token picker from supported list)
- Step 3: Review + sign — summary card with all details, "Create Pool" button that triggers wallet tx
- IPFS upload via Pinata or web3.storage — progress indicator, hash returned
- Success state: animated checkmark, pool link, CTAs (share, deposit now)

### 3.4 — Pool Browse + Detail Pages
- **Browse page**: Grid of pool cards (3 cols desktop, 2 tablet, 1 mobile). Each card shows: cover image thumbnail, title, creator handle, progress bar with percentage, goal + raised amounts, deadline countdown. Sort/filter bar (newest, ending soon, most funded, category filter).
- **Detail page**: Full-width cover image, title, creator info, description. Progress section (bar + exact amounts + supporter count). Deadline countdown (live updating). Supporter avatars (first 6). Action buttons (deposit / submit work / vote depending on status + permissions). Activity feed (events timeline: created, deposited, work submitted, votes cast).
- Animated list transitions on filter/sort change
- Infinite scroll or paginated

### 3.5 — Action Flows
- **Deposit**: Amount input with quick-select buttons (25/50/75/100% of remaining goal). Estimated badge (if applicable). Wallet confirmation popup. Success toast with tx link. Real-time progress bar update.
- **Submit work**: Creator-only button on pool detail. File upload + IPFS upload. Preview before submission. Confirmation modal. Wallet tx. Success state.
- **Vote**: Two large buttons (Approve / Reject) with animated highlight on hover. Shows supporter's current weight. After vote: result shown with checkmark. Vote tallies displayed with animated bar.
- All flows show loading skeleton during wallet tx, success animation on completion, error toast on failure.

### 3.6 — Dashboard
- **Tabs**: Created pools, Funded pools, Transaction history
- **Created**: Pool cards with status badge (Open, Awaiting Vote, Paid, Expired). Quick actions per status.
- **Funded**: Same card style, shows amount contributed. Status-dependent actions (vote if awaiting, rate if completed).
- **Transaction history**: Table with date, type, pool, amount, status. Filterable.
- **Stats header**: Total created, total funded, success rate, badges earned (if applicable).

### 3.7 — Responsive + PWA Finalization
- Mobile-first CSS: single column on mobile, multi-column breakpoints at 640/1024/1280px
- Bottom sheets replace modals on mobile
- Touch targets at least 44px
- PWA install prompt (custom, cream-styled)
- Offline page (service worker fallback)
- Splash screen verified on iOS/Android
- Performance budget: < 100KB CSS, < 200KB JS (gzip), < 5s to interactive on 3G

---

## Milestone 4 — Fiat On-Ramp + Gasless

**Goal**: Non-crypto users can fund pools with card/bank. No wallet required for casual supporters.

### 4.1 — Moonpay/Banxa Widget
- Integrate Moonpay or Banxa SDK for fiat-to-crypto purchases
- Pre-select destination token (USDC or XLM depending on pool)
- Widget styled to match cream aesthetic (custom theme if SDK supports)
- Success callback: after purchase, poll for deposit confirmation
- Error states: purchase failed, timeout, refund flow

### 4.2 — Email-Based Onboarding (Turnkey/Capsule)
- Integration with Turnkey or Capsule for non-custodial wallet creation via email
- User enters email → receives magic link → wallet created in background without browser extension
- Wallet creation animated flow: "Creating your wallet..." with soft loading animation
- Seed phrase backup optional (for power users) — skip for casual users
- Gasless from the start (see 4.3)

### 4.3 — Sponsored Transaction Relayer
- Backend relayer that covers XLM transaction fees for users
- Relayer signs and submits transactions with its own fee budget
- Rate limiting to prevent abuse (max N tx per wallet per day)
- Relayer funded by platform treasury (small percentage of platform fee covers this)
- Fallback: if relayer is down, user can fall back to paying their own fees

### 4.4 — Unified "Deposit with Card" UX
- Combined flow: user enters amount in fiat (USD/EUR) → Moonpay price shown → purchase → wallet created (if new) → deposit tx sponsored → pool funded
- Single UI surface: card input, amount slider, "Fund with Card" button
- Progress steps with animated indicators: Purchase → Confirm → Deposited
- All styled in design system

### 4.5 — Non-Crypto User Testing
- Recruit 5-10 non-crypto users (friends, family, or paid testers)
- Observe their flow: can they create an account? Fund a pool? Understand what's happening?
- Identify friction points in the email → purchase → deposit flow
- Fix UX issues, retest

---

## Milestone 5 — Notifications + Localization

**Goal**: Users stay informed without refreshing. Platform speaks multiple languages.

### 5.1 — Email Notifications
- Transactional email service (Resend, SendGrid, or AWS SES)
- Templates in cream/warm brand style (not generic HTML)
- Events: pool created (confirmation), deposit received, goal reached, work submitted, vote needed, pool settled (paid/refunded)
- Unsubscribe link + preference center (email frequency, event types)
- Email identity: from `kindlepool@` with friendly name

### 5.2 — Push Notifications (PWA)
- Browser push API + VAPID keys
- Service worker push handler with notification display
- Notification click navigates to relevant pool page
- Permission request: in-app prompt (styled card, not browser default) explaining value
- Permission denied → gracefully degrade to in-app only

### 5.3 — In-App Notification Center
- Bell icon in header with unread count badge (animated count change)
- Notification dropdown: list of recent notifications, grouped by date
- Notification types: funding received, goal reached, work submitted, vote cast on your pool, pool settled
- Read/unread state persisted locally
- Mark all as read with smooth animation
- Click navigates to relevant pool detail

### 5.4 — i18n Framework
- react-i18next or similar
- Namespace-based: `common`, `pools`, `dashboard`, `notifications`
- Locale detection from browser settings + manual override
- Translation management: Locize or simple JSON files with git-based workflow
- All user-facing strings extracted from components
- Dates, numbers, currencies formatted per locale (Intl API)

### 5.5 — Ship Languages
- English (source of truth)
- Spanish (Latin America — largest Stellar user base after US)
- French (West Africa — growing Stellar adoption)
- Community translation contributions via Crowdin or similar (future)

---

## Milestone 6 — Creator Tools

**Goal**: Professional tooling for creators to build trust, prevent abuse, and manage their work.

### 6.1 — Creator Verification Flow
- Optional verification badge on creator profile
- Steps: email verification, link social account (Twitter/GitHub), optional ID verification (Persona or similar) for higher trust tier
- Verified badge: warm accent checkmark on profile + pool cards
- Unverified creators can still create pools — but verified ones rank higher in search

### 6.2 — Anti-Sybil Detection
- Minimum account age for creating pools (e.g., wallet must exist for > 7 days or have prior transaction history)
- Deposit pattern analysis: flag pools where a single wallet deposits > 80% of goal
- IP fingerprinting for web-based users (same IP across multiple creator accounts)
- Manual review queue for flagged pools (admin dashboard)
- Strike system: creators who abuse get temporary or permanent ban

### 6.3 — Milestone-Based Escrow
- Instead of all-or-nothing, creators can split payout into stages
- Templates: 3-stage (30% draft → 30% revision → 40% final), 2-stage (50% progress → 50% final)
- Each stage requires supporter approval vote before funds release
- Contract holds total pool, releases per-stage based on votes
- Supporters see per-stage progress on pool detail page with visual timeline

### 6.4 — Pool Templates
- Pre-configured pool settings per content type
- **Art**: 30-50-20 milestone split, 7 day vote window, image file format check
- **Writing**: 20-30-50 split, 5 day vote window, word count minimum
- **Music**: 25-25-50 split, 10 day vote window, audio format + length minimum
- **Code**: 50-50 split, 14 day vote window, repository link required
- Templates are starting points — creators can customize

### 6.5 — Creator Analytics Dashboard
- Performance metrics over time: pools created, success rate, total earned, total supporters
- Per-pool analytics: deposit timeline, supporter geography (via IP), vote breakdown, refund rate
- Supporter retention: returning supporter %, repeat funding rate
- Earnings chart (filterable by time range)
- Export data as CSV

---

## Milestone 7 — Dispute Resolution + Community

**Goal**: Fair, decentralized arbitration when things go wrong.

### 7.1 — On-Chain Dispute Raise
- After a rejection vote (or creator claims unfair rejection), supporter or creator can raise dispute
- Dispute includes: pool_id, reason (text), evidence hash
- Contract locks a small deposit (to prevent spam)
- Dispute status tracked on-chain

### 7.2 — Community Arbitration Panel
- Random pool of arbitrators selected from verified supporters (active > 30 days, funded > 3 pools)
- Arbitration vote: weighted by arbitrator's own funding history
- Simple binary: "Uphold rejection" or "Override — pay creator"
- Majority wins (simple > 50%)
- Arbitrators who vote with the majority earn a small reward (from dispute fee)

### 7.3 — Appeal Mechanism
- Losing side can appeal with higher deposit
- Appeal goes to a larger panel (3x the original panel size)
- Appeal decision is final
- Time-locked: appeal must be filed within 7 days of initial ruling

### 7.4 — Anti-Spam Arbitration Fee
- Raising a dispute costs a small fee (e.g., 1% of pool goal, capped at narrow range)
- Fee returned if you win the dispute
- Fee burned/treasuried if you lose
- Prevents frivolous disputes while ensuring access

### 7.5 — Dispute History + Arbitrator Reputation
- Public ledger of all disputes and rulings
- Arbitrator track record: cases participated, alignment with majority, accuracy score
- High-reputation arbitrators get prioritized for panel selection
- Arbitrator leaderboard (optional — gamified reputation)

---

## Milestone 8 — SDK + Public API

**Goal**: Developers can build on KindlePool. Third-party integrations become possible.

### 8.1 — TypeScript SDK (npm)
- Package name: `@kindlepool/sdk`
- Covers: all contract interactions (createPool, deposit, submitWork, vote, finalize), all API calls (list pools, get pool, get user pools), wallet abstraction (Freighter, xBull, Capsule)
- Full TypeScript types matching contract data model
- Examples in README for each function
- Published to npm with CI

### 8.2 — Public API Key System
- Developer portal: sign in with GitHub → generate API keys
- Key tiers: free (1000 req/day), pro (10000 req/day), enterprise (unlimited)
- Rate limiting per key
- Usage dashboard in developer portal
- Key revocation

### 8.3 — Webhook System
- Register webhook URLs per event type
- Events: pool.created, pool.funded, pool.goal_reached, work.submitted, vote.cast, pool.settled, dispute.raised, dispute.resolved
- Payload: full pool state + event data as JSON
- Retry with backoff on failure (3 attempts)
- Webhook secret for signature verification

### 8.4 — API Documentation
- OpenAPI 3.0 spec published at `api.kindlepool.dev/docs`
- Interactive playground (Swagger UI or Scalar)
- Code examples in TypeScript, Python, cURL
- Rate limits, authentication, error codes documented
- Changelog + versioning strategy (semver)

### 8.5 — Example Integrations
- **Embed widget**: iframe or web component that shows a pool card. Customizable theme colors to match host site.
- **Discord bot**: slash commands — `/pools trending`, `/pool create`, `/fund <pool_id> <amount>`
- **Personal website badge**: embeddable "Support me on KindlePool" button with stats

---

## Milestone 9 — Monitoring + CI/CD + Security

**Goal**: Production-ready infrastructure. Contracts audited. CI/CD pipeline automated.

### 9.1 — CI/CD Pipeline
- GitHub Actions: lint → typecheck → test (unit + integration) → build WASM → deploy to testnet → run e2e tests → deploy to mainnet (manual trigger)
- Contract tests run in CI on every PR
- Front-end: build → deploy to staging (Vercel/Cloudflare) → smoke test → deploy to production
- API: build → test → deploy (Docker + fly.io or Railway)
- All secrets stored in GitHub Actions secrets

### 9.2 — Contract Monitoring
- Daily health check: call `get_pool` on a known pool, verify response is valid
- Anomaly detection: sudden spike in deposit volume, unusual pool creation rate, rapid successions of finalize calls
- Alerting: Slack/PagerDuty/webhook on anomaly
- Dashboard: contract metrics (total pools, total volume, active pools, success rate)

### 9.3 — API Monitoring
- Uptime monitoring: 1-minute interval pings from multiple regions (Checkly, Better Uptime)
- Error tracking: Sentry for API + front-end
- Performance monitoring: response times p50/p95/p99 per endpoint
- Log aggregation: structured logging (JSON) → Grafana/Loki or similar
- Alert on: error rate > 1%, p95 latency > 500ms, uptime < 99.9%

### 9.4 — External Security Audit
- Engage Soroban-specialized audit firm (OtterSec, Cantina, or Trail of Bits)
- Audit scope: all contract code, especially settlement math, token transfer logic, access control
- Timeline: 2-4 weeks
- Fix all critical/high findings before mainnet launch
- Publish audit report publicly

### 9.5 — Bug Bounty Program
- Platform: Hackenproof, ImmuneBytes, or custom
- Scope: contract vulnerabilities, API vulnerabilities, logical errors
- Rewards: $500 (low) to $10,000 (critical)
- Rules: no testnet attacks, no social engineering, responsible disclosure
- Public acknowledgement page for valid reports

---

## Milestone 10 — Monetization + Legal + Launch

**Goal**: Sustainable platform. Legally compliant. Live on mainnet.

### 10.1 — Fee Tier System
- **Free tier**: 0.5% platform fee on successful pools. Basic discoverability.
- **Premium tier**: 1.5% fee but pools get boosted visibility (featured placement, email notification to relevant supporters, social media spotlight)
- Premium tier also includes: custom cover image, longer description, analytics export
- Fee deducted from payout (not from deposits)
- No fee on refunds
- Fee treasury managed via Soroban contract with timelock

### 10.2 — Legal Documents
- Terms of Service: user obligations, prohibited content, dispute process, liability limitations
- Privacy Policy: what data is collected (email, IP, wallet address), how it's used, data retention, GDPR/CCPA compliance
- DMCA Takedown Policy: for copyright-infringing content submitted as work
- Creator Terms: specific to pool creators (delivery obligations, intellectual property rights)
- Generated with legal counsel or reputable template service

### 10.3 — Mainnet Deploy
- Deploy audited contract to Stellar mainnet
- Verify contract on StellarExpert
- Update contract addresses in front-end + SDK + API config
- Run full integration tests against mainnet
- Document mainnet contract addresses + deploy block

### 10.4 — Production Infrastructure
- Domain: kindlepool.dev (or .app, .xyz)
- SSL via Cloudflare or Let's Encrypt
- CDN: Cloudflare for static assets + API caching
- Front-end: Vercel or Cloudflare Pages
- API: Docker + fly.io / Railway / DigitalOcean
- Database: managed Postgres (Railway, Neon, or Supabase)
- Redis: Upstash or Railway managed
- IPFS: Pinata or web3.storage for metadata + work files

### 10.5 — Documentation Site
- Built with Docusaurus or Astro, styled with design system
- Sections: User Guide, Creator Guide, Developer Docs, FAQ
- User Guide: "What is KindlePool?", "How to fund a pool", "How to vote", "How to get refunded"
- Creator Guide: "Creating your first pool", "Setting milestones", "Handling disputes"
- Developer Docs: SDK reference, API reference, contract ABI, webhooks, embed widget
- FAQ: "What happens if a creator doesn't deliver?", "What fees does KindlePool charge?", "How are disputes resolved?"

---

## Milestone 11 — Growth Features

**Goal**: Platform growth, community building, ecosystem expansion.

### 11.1 — On-Chain Referral Program
- Each user gets a referral link with on-chain tracking
- Referral creates a pool → referrer gets a small bonus (e.g., 5% of platform fee from that pool)
- Referral sign-up flow: shared link → wallet connect → referrer credited
- Leaderboard: top referrers this month, all time

### 11.2 — Creator Leaderboard + Trending
- Weekly/monthly leaderboard: most funded creators, highest success rate, most supporters
- Trending algorithm: recent funding velocity × unique supporters × recency
- "Rising creators" section: new creators gaining traction
- Leaderboard cards with animated rank changes (ribbon/medal icons)

### 11.3 — Embeddable Pool Widget
- iframe snippet: `<iframe src="https://kindlepool.app/embed/pool/:id" />`
- Theme customization via query params: `?bg=cream&accent=warm`
- Responsive: adapts to container width
- Actions: view pool details, fund (opens kindlepool.app in new tab or iframe depth)
- React/web component version: `<kindlepool-pool id="123" />`

### 11.4 — Discord/Telegram Bot
- **Discord**: slash commands — `/trending`, `/pool <id>`, `/create` (quick create with defaults), `/fund <id> <amount>`
- **Telegram**: inline queries, same commands
- Bot notifications: opt-in to alerts when pools you funded have activity
- Bot uses SDK under the hood

### 11.5 — Platform Analytics Dashboard
- Internal/admin dashboard: total pools, total volume, active users, success rate, average pool size, fee revenue
- Charts: daily/weekly/monthly trends (new pools, volume, users)
- Geographic distribution (via IP data)
- Creator/supporter retention cohorts
- All visualized with soft, organic charts (no sharp lines, warm palette)

---

## Summary

| Phase / Milestone | Focus | Sub-Milestones |
|---|---|---|
| **Phase 0** | Contract Core | 8 |
| **M1** | Indexer + API | 5 |
| **M2** | Design System | 6 |
| **M3** | Web App MVP (PWA) | 7 |
| **M4** | Fiat On-Ramp + Gasless | 5 |
| **M5** | Notifications + Localization | 5 |
| **M6** | Creator Tools | 5 |
| **M7** | Dispute Resolution | 5 |
| **M8** | SDK + Public API | 5 |
| **M9** | Monitoring + CI/CD + Security | 5 |
| **M10** | Monetization + Legal + Launch | 5 |
| **M11** | Growth Features | 5 |

**Total**: 66 sub-milestones across 12 phases.

Each sub-milestone is independently buildable, testable, and releasable. No phase depends on a future design choice.

---

*Last updated: July 2026*
