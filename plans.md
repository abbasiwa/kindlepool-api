# KindlePool — Web Rebuild & Platform Plan

> Master planning document. Created 2026-08-14. Author: mikwansa (execution) / nekwasar (repos).
> Mirrors the ideas doc pushed to `nekwasar/stellar-ideas`.

---

## 1. North Star

Two products, one brand, one on-chain identity, two different interaction models.

| Product | Domain | Model | Audience flow |
|---|---|---|---|
| **KindlePool.app** | `.app` | Project-bound funding pools | Two-sided (creator posts work, funders show up at a time) |
| **KindlePool.io** | `.io` | Always-on creator support | One-sided (only creators touch the platform; sponsors fund off-platform) |

Shared DNA across both: **fund the work, not the creator** · trustless on-chain · public verifiable records · auto-refund when goals aren't met.

---

## 2. Locked decisions

| # | Decision | Value |
|---|---|---|
| 1 | Backend hosting | **Heroku Eco** ($5/mo) — GitHub Student Pack gives $13/mo for 2 years |
| 2 | Service architecture | **Single unified Node backend process** (indexer + relayer + notifier + monitor in one process) |
| 3 | Database | **MongoDB Atlas M0** (free, 512 MB) as main persistent DB + **SQLite** hot cache on the dyno |
| 4 | Repo structure | **2 repos**: `kindlepool-api` + `kindlepool-web` |
| 5 | Contract location | `kindlepool-api/contracts/` (Rust, deploys to Soroban) |
| 6 | SDK publishing | **GitHub Packages npm registry** (`@mikwansa/kindlepool-sdk` via npm.pkg.github.com) |
| 7 | Phase 0 order | **Split repo first** |
| 8 | Docs strategy | **Separate webpages per `.md` file** — web reads the .md files at build time (never converts them) |
| 9 | Auth | **Email-only magic-link**; wallet-link happens **in Settings** |
| 10 | Font | **Plus Jakarta Sans** (+ JetBrains Mono for code) |
| 11 | Accent color | **Electric indigo** |
| 12 | Mobile nav | **Bottom nav bar** (app-feel) |
| 13 | Mobile ≠ Desktop | **Distinct layouts** via container queries (mobile-first) |
| 14 | Frontend framework | Vite + React PWA (current) → design-system refactor in Phase 4 (Astro optional later) |
| 15 | .io model | Quote-to-Sponsor (headline), Tip-with-required-reason (companion) — see §7 |

---

## 3. Design system (locked)

### 3.1 Tokens — two layers

```
PRIMITIVE (raw values)
  Neutrals:       100–900
  Indigo:         100–900 (500 = electric, #3D3DFF)
  Status:         success/warning/error/info (low saturation)

SEMANTIC (functional usage)
  Surface-0       canvas background
  Surface-1       card / container background
  Surface-2       hover, active, borders
  Text-Primary    90%+ legibility
  Text-Muted      secondary metadata
  Accent-Primary  single focal-point action (Indigo-500)
  Accent-Foreground  text-on-accent
  Status colors   minimal saturation only
```

### 3.2 Spatial scale (no arbitrary pixels)

```
4, 8, 12, 16, 24, 32, 48, 64, 96, 128
```

### 3.3 Typography

```
Body      Plus Jakarta Sans 400 · 17px mobile / 18px desktop · line-height 1.65
Headers   Plus Jakarta Sans 500 · modular scale 1.25
Micro     Plus Jakarta Sans 600 · 13px · letter-spacing +1%
Code      JetBrains Mono 400
```

### 3.4 Browser frame & shell

```
<meta name="theme-color"> = Surface-0        (no chrome jarring)
env(safe-area-inset-*) padding on fixed bars
overscroll-behavior-y: none                  (installed-app feel)
Top bar   48px mobile / 56px desktop · border-bottom Surface-2 @ 12% opacity · no shadow
Bottom nav (mobile only) 64px · border-top Surface-2 @ 12% opacity
```

### 3.5 Strict don'ts

- ❌ Drop shadows (except focus ring: 2px Solid Accent-Primary @ 30% opacity)
- ❌ Gradients, bevels, 3D transforms
- ❌ backdrop-filter / frosted glass
- ❌ Arbitrary pixel values (only the 4px/8px scale)
- ❌ Multiple accent colors (single accent; secondary actions via surface contrast)
- ❌ Heavy font weights (400 body, 500 headers, 600 micro-labels only)
- ❌ Layout shift (explicit aspect-ratio / min-height on all dynamic containers)

### 3.6 Mobile vs Desktop (container queries, not viewport)

```
MOBILE (≤ 768px container)
  Single column · bottom nav (5 icons) · sticky primary CTA
  Sidebar → drawer · 48px+ touch targets · app-feel

DESKTOP (> 768px container)
  Multi-column (sidebar + main + aside) · top nav only
  Hover states · more content density
  PoolDetail = pool info | activity feed | supporters side-by-side
```

---

## 4. Repo structure

### 4.1 `kindlepool-api/`

```
contracts/sponsor-pool/      # Soroban Rust contract (CONTRACT_VERSION 5)
packages/sdk/               # @mikwansa/kindlepool-sdk — TS wrappers over contract ABI + API
services/                   # indexer, relayer, notifier, monitor (become modules)
api/                        # unified backend entrypoint
  src/index.ts              # boots all services + mounts Express API
  src/auth/                 # magic-link + JWT
  src/routes/               # consolidated route handlers
  src/db/                   # Mongoose models
scripts/                    # deploy.sh, verify-matrix.sh, fetch-docs, build-sdk
docs/                       # canonical markdown docs (source of truth)
tests/live/                 # live testnet integration suite
Cargo.toml                  # workspace root
Dockerfile · Procfile · fly.toml · docker-compose.yml
.env.example · .github/workflows/ci.yml
```

### 4.2 `kindlepool-web/`

```
web/
  src/
    pages/                  # 12 existing + new routes (§6)
    components/             # ui primitives, Footer, BottomNav, MarkdownPage
    layouts/                # MobileLayout, DesktopLayout
    lib/                    # wallet, contract, relayer, sdk
    hooks/                  # useAuth, useLayout
    design/                 # tokens.ts, Reset.css, global.css
  public/                   # static assets + docs snapshot (build-time)
vercel.json · package.json · .env.example · .github/workflows/ci.yml
```

### 4.3 SDK consumption

```json
// kindlepool-web/package.json
"@mikwansa/kindlepool-sdk": "^0.1.0"  // via .npmrc scope → npm.pkg.github.com
```

---

## 5. Architecture

```
┌────────────────────────────────────────────────────────────────┐
│            Soroban Testnet (free, public)                       │
│   SponsorPool v5 (pools + tags)                                │
└──────────────┬─────────────────────────────────────────────────┘
               │ RPC + events
               │
┌──────────────▼─────────────────────┐   ┌───────────────────────┐
│   Heroku Eco dyno ($5/mo)          │   │  Vercel (free)         │
│   ┌─────────────────────────────┐  │   │  - kindlepool.app      │
│   │ Unified Node backend        │  │   │  - kindlepool.io       │
│   │ indexer + relayer           │  │   │  - Freighter           │
│   │ notifier + monitor + API    │◄─┼───┤  - SDK                 │
│   └─────────────────────────────┘  │   │  - Contract calls      │
│   ┌─────────────────────────────┐  │   └───────────────────────┘
│   │ SQLite hot cache (indexer)  │  │
│   └─────────────────────────────┘  │
└──────────────┬─────────────────────┘
               │ Mongoose (persistent)
               ▼
        MongoDB Atlas M0 (free, 512 MB)
        users · subscriptions · api keys · profiles · works · tips
```

Data flow:
- **Writes**: user → browser (Freighter signs) → `POST /api/v1/relay` → relayer fee-bumps → Soroban
- **Reads (hot)**: web → indexer API (MongoDB/SQLite) — fast, eventual
- **Reads (authoritative)**: web → Soroban RPC directly — exact

---

## 6. `.app` rebuild scope

### 6.1 Existing pages (12)
Home · Explore · PoolDetail · CreatePool · Dashboard · AddFunds · Disputes · Pricing · CreatorAnalytics · Leaderboard · PlatformAnalytics · DeveloperPortal

### 6.2 New pages (SEO/content/legal/docs)
```
/about · /faq · /how-it-works · /blog (+ /blog/:slug) · /changelog
/security · /status · /careers · /c/:address · /explore/:category
/settings (10 tabs) · /login
/docs (+ /docs/[slug] per .md file) · /legal/privacy · /legal/terms
/legal/cookies · /legal/bounty · /legal/dmca · /legal/security
```

### 6.3 Settings page (new — 10 tabs)

1. **Profile** — display name, bio, avatar, public slug
2. **Email & Login** — verified email, magic-link resend, change email, delete account
3. **Wallet** — link/unlink Stellar address (signed ownership proof), set primary wallet
4. **Notifications** — per-event toggles, digest frequency, push opt-in
5. **Embed** (future .io) — default tip amounts, embed theme
6. **Appearance** — light/dark/system theme
7. **Sessions & Security** — active sessions, logout all, 2FA (future)
8. **Connected Apps** — API keys list, create/revoke
9. **Privacy & Data** — export JSON, delete account
10. **Disputes** — my open disputes (creator + supporter)

### 6.4 Docs as routes (per .md file, read at build time)

| Source (.md in `kindlepool-api/docs/`) | Web route |
|---|---|
| SPEC.md | `/docs/contract` |
| audit/report-v1.md | `/docs/security-audit` |
| known-issues.md | `/docs/known-issues` |
| PRIVACY.md | `/docs/privacy` |
| TERMS.md | `/docs/terms` |
| BOUNTY.md | `/docs/bounty` |
| SECURITY.md | `/docs/security` |
| ENTERPRISE_PLAN.md | `/docs/enterprise-plan` |
| coverage-report.md | `/docs/coverage` |
| openapi.json | `/docs/api` |
| (authored) | `/docs/user-guide`, `/docs/creator-guide`, `/docs/faq` |

Mechanism: `web/scripts/fetch-docs.ts` at build time copies `docs/*.md` from `kindlepool-api` raw GitHub → `web/public/docs/`. `<MarkdownPage slug>` renders via markdown-it. **The .md files are never converted; they are read.**

### 6.5 SEO infrastructure

- Per-page `<title>`/`<meta>`/canonical/OpenGraph/Twitter via `useMeta()` hook
- `sitemap.xml` at build · `robots.txt`
- JSON-LD: Organization (/) · Product (/pool/:id) · BreadcrumbList everywhere
- Blog + FAQ for content surface

---

## 7. `.io` product (second surface)

### 7.1 Core constraint
> Sponsors never come to the platform. Only creators do.

### 7.2 Headline model — **Quote-to-Sponsor**
Tip requires a public reason + work reference. Quote threads become indexable discovery content. Creator-only platform; sponsors fund via embeds / existing wallets off-platform.

### 7.3 Companion model — **Tip-with-required-reason**
Lower-effort version: every tip must include a reason; tips without reasons don't exist.

### 7.4 Alternative models (candidate list)
| # | Model | One-line |
|---|---|---|
| 2 | Reverse-bounty board | Supporters post bounties; creators apply (mirror of .app) |
| 3 | Work-log tipping | Per-entry tipping of a public work-log |
| 5 | Ante-then-deliver | Commit to fund future work, escrow on delivery |
| 6 | Discovery-vouching | Reputation-weighted discovery |

### 7.5 Sponsor flow friction (known issue — must solve)
Crypto-only path converts ~1–5% (wallet install, USDC acquisition, gas, memo typo). Paths to fix:
- **Path A** — crypto-only, optimize (QR, deep links, sponsored gas, off-chain memo)
- **Path B** — fiat via Stripe (20–40% funnel, regulatory overhead)
- **Path C — hybrid (recommended for "big platform")** — card + crypto dual path

### 7.6 .io pages (~5)
Hub (`/c/:handle`) · single tag (`/c/:handle/:slug`) · embed generator · sign-up · dashboard/settings

---

## 8. Execution phases

### Phase 0 — Split repo (1–2 days)
1. Create `nekwasar/kindlepool-api` + `nekwasar/kindlepool-web` (private)
2. Move files per §4
3. Wire SDK via GitHub-tarball
4. Set up CI on both repos

### Phase 1 — Web uses contracts (3–5 days)
1. Add `@stellar/stellar-sdk` + `@mikwansa/kindlepool-sdk` to web
2. New `lib/contract.ts`, `lib/relayer.ts`, `lib/sdk.ts`
3. Wire every product flow → real contract call (create, deposit, vote, submit_work, finalize, cancel_pool, claim_refund, raise_dispute, resolve_dispute, appeal_dispute)
4. Fix audit issues #6–#10, #14

### Phase 2 — Unified backend + Mongoose (3–5 days)
1. `api/` unified entrypoint boots all services + Express
2. Mongoose models: User, Subscription, ApiKey, CreatorProfile, WorkEntry
3. Move existing services into modules; SQLite stays as indexer hot cache

### Phase 3 — Deploy readiness (2–3 days)
Dockerfile · Procfile · fly.toml · docker-compose.yml · .env.example · GitHub Actions · pino logging · SIGTERM graceful shutdown · /health

### Phase 4 — Settings + Docs + SEO/Legal/Footer + Design system (4–6 days)
- Settings page (§6.3)
- Docs routes (§6.4) via build-time fetch
- SEO infra (§6.5)
- Footer + legal routes
- Design system foundation: `design/tokens.ts`, Reset.css, global.css, ui.tsx, MobileLayout, DesktopLayout, `useLayout()`, BottomNav

### Phase 5 — Auth (email magic-link) (2–3 days)
- api: /auth/request-magic-link, /auth/verify, /auth/me, /auth/link-wallet, /auth/logout
- web: useAuth(), LoginPrompt, /login, /settings/wallet (signed ownership proof)

### Phase 6 — Initial deploy (1 day)
1. Heroku Eco dyno (kindlepool-api) + env vars
2. MongoDB Atlas M0 → KINDPOOL_MONGO_URL
3. Vercel (kindlepool-web) + env vars
4. Deploy contract to testnet → KINDPOOL_CONTRACT_ID
5. End-to-end smoke test on .app

**Total: ~3–5 weeks.**

---

## 9. Monthly cost

| Item | Cost |
|---|---|
| Heroku Eco dyno | $5/mo |
| Vercel free tier | $0 |
| MongoDB Atlas M0 | $0 |
| Soroban testnet RPC | $0 |
| Custom domain (optional) | ~$1/mo |
| **Total** | **$5–6/mo** |

---

## 10. Known audit issues (tracked on GitHub #6–#31)

Critical: #6 sw.js invalid JS · #7 CreatePool off-by-one · #8 stubbed flows · #9 mock data · #10 SDK /api/v1 · #11 docker curl healthcheck · #12 relayer fee-drain
High: #13–#21 (CI masks tests, indexer clobbers, deploy tooling, nginx SW cache)
Medium: #22–#28 (widget XSS, SDK ABI, Button loading, dispute nesting, p_refr, p_fees, isCreator)
Low: #29–#31

---

## 11. Open questions / deferred

- .io sponsor flow: Path A / B / C decision deferred (see §7.5)
- .io contract: extend SponsorPool (v5) vs separate KindleTag contract vs off-chain
- Astro migration: deferred until after Vite design-system refactor
- .io build order: after .app is live (per current plan)
