# KindlePool — Backend

**Fund the work, not the creator.**

Micro-sponsor pools for creators. Supporters fund specific work, not creators. Money pools trustlessly on Stellar Soroban, releases to the creator only if quality thresholds are met, and automatically refunds supporters if the goal fails or work is rejected.

## Repos

- **`mikwansa/kindlepool-api`** — contract, SDK, unified backend, docs (this repo)
- **`mikwansa/kindlepool-web`** — React/PWA frontend + widget

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│            Soroban Contract (SponsorPool)                    │
└──────────────────────────────┬───────────────────────────────┘
                               │ RPC + events
┌──────────────────────────────▼───────────────────────────────┐
│   Unified backend (api/) — one process                       │
│   :3001 indexer (REST + listener) · SQLite hot cache          │
│   :3002 relayer (fee-bump)                                    │
│   :3003 notifier (email)                                      │
│   monitor (health/anomalies)                                  │
│   MongoDB (persistent layer: users, subs, profiles, works)   │
└──────────────────────────────┬───────────────────────────────┘
                               │
                        Web App (Vercel)
```

## Local dev (unified backend)

```bash
npm install            # root workspace (api + services)
cp .env.example .env   # or api/.env.example
npm run build
npm start              # boots all services
```

Requires `KINDPOOL_CONTRACT_ID` to enable the event listener. MongoDB via `KINDPOOL_MONGO_URL` (Atlas or local `mongodb://localhost:27017/kindlepool`).

## Deploy

| Target | Config |
|---|---|
| **Heroku** | `Procfile` → `web: node api/dist/api/src/index.js` |
| **Fly.io** | `fly.toml` (http_service :3001 + persistent volume) |
| **Docker / compose** | `Dockerfile` + `docker-compose.yml` (backend + local mongo) |

## Smart Contract

The contract is in `contracts/sponsor-pool/`.

```bash
# Build (wasm32v1-none — the target used by CI and deploys)
cargo build -p sponsor-pool --target wasm32v1-none --release

# Test
cargo test -p sponsor-pool --lib

# Deploy (stellar CLI)
stellar contract deploy --wasm target/wasm32v1-none/release/sponsor_pool.wasm \
  --source-account deployer --network testnet
```

See `scripts/deploy.sh` and `docs/SPEC.md` for the contract ABI and audit details.

## SDK

`@mikwansa/kindlepool-sdk` is published to GitHub Packages (`npm.pkg.github.com`) and consumed by the web app.

## License

MIT
