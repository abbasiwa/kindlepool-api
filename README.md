# KindlePool

Micro-sponsor pools for creators. Fund the **work**, not the creator.

KindlePool lets supporters fund specific pieces of creative work — a video, a song, an article, a feature — through trustless pools on **Stellar Soroban**. Money is held by the contract, not the platform. Supporters vote on the delivered work, and funds release to the creator (minus a small fee) or refund automatically.

This repository contains the smart contract, the backend services, the TypeScript SDK, and the docs that power [kindlepool.app](https://kindlepool.app).

> The web frontend lives in [`abbasiwa/kindlepool-web`](https://github.com/abbasiwa/kindlepool-web).

---

## Overview

```
┌────────────────────────────┐
│  Soroban Smart Contract    │  Pools · Supporters · Disputes · Referrals
└──────────────┬─────────────┘
               │ RPC + events
┌──────────────▼─────────────┐
│  Backend services          │  indexer · relayer · notifier · monitor · auth
│  Persistent store (Mongo)  │  users · subscriptions · profiles
└──────────────┬─────────────┘
               │ HTTPS
        Web App (Vercel)
```

- **On-chain is the source of truth.** Pool, supporter, and dispute state lives in the Soroban contract. Off-chain services provide caching, notifications, and app-level data.
- **One backend process.** All services run as a single Node process, simplifying deployment.
- **Browser-native SDK.** The SDK builds contract transactions that users sign with their own Stellar wallet before submission.

---

## Repository layout

```
api/                    # unified backend entrypoint + auth + models
contracts/sponsor-pool/ # Soroban Rust contract
packages/sdk/           # @abbasiwa/kindlepool-sdk (GitHub Packages)
services/               # indexer, relayer, notifier, monitor
scripts/                # deploy + verification tooling
docs/                   # legal + security disclosure
tests/live/             # live testnet integration suite
Dockerfile · Procfile · fly.toml · docker-compose.yml
```

---

## Getting started

### Prerequisites

- Node.js 20+
- Rust toolchain with the `wasm32v1-none` target (for the contract)
- A Stellar testnet account

### Install & run

```bash
npm install
cp .env.example .env    # set the values you need (see .env.example)
npm run build
npm start
```

### Contract

```bash
cargo build -p sponsor-pool --target wasm32v1-none --release
cargo test  -p sponsor-pool --lib
```

### SDK

The SDK is published to GitHub Packages and installed via `.npmrc`:

```
@abbasiwa:registry=https://npm.pkg.github.com
```

```ts
import { KindlePoolContract, KindlePoolAPI } from '@abbasiwa/kindlepool-sdk'
```

---

## Configuration

Copy `.env.example` and fill in the values relevant to your deployment. The example file documents every variable and which deployments require it.

**Important**: configure secrets (e.g. database credentials, signing keys, email/SMTP credentials, session secrets) through your hosting platform's secret manager or environment configuration. Never commit them.

---

## Deployment

| Target | File | Notes |
|---|---|---|
| **Heroku** | `Procfile` | Node buildpack |
| **Docker** | `Dockerfile` | Multi-stage image |
| **Fly.io** | `fly.toml` | Alternative host |
| **Local** | `docker-compose.yml` | Backend + MongoDB |

---

## Testing

```bash
cargo test -p sponsor-pool --lib   # contract
cd api && npm test                 # backend unit + route tests
cd services/indexer && npm test    # indexer
cd services/relayer   && npm test   # relayer
cd services/notifier  && npm test   # notifier
cd services/monitor   && npm test   # monitor
```

There is also a live testnet integration suite in [`tests/live/`](tests/live/).

---

## Documentation

- [`docs/SECURITY.md`](docs/SECURITY.md) — security disclosure
- [`docs/BOUNTY.md`](docs/BOUNTY.md) — bug bounty program
- [`docs/TERMS.md`](docs/TERMS.md) · [`docs/PRIVACY.md`](docs/PRIVACY.md) — legal

---

## License

MIT
