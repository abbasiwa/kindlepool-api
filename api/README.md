# KindlePool Unified Backend

One process that boots all four KindlePool services + the persistent MongoDB layer.

## Services

| Port | Service | Enabled by |
|---|---|---|
| 3001 | Indexer API + Soroban event listener | always |
| 3002 | Relayer (fee-bump relay) | `KINDPOOL_ENABLE_RELAYER` (default on) |
| 3003 | Notifier (email subscriptions) | `KINDPOOL_ENABLE_NOTIFIER` (default on) |
| — | Monitor (health/anomaly checks) | `KINDPOOL_ENABLE_MONITOR` (default on) |

## Architecture (Phase 2)

```
api/src/index.ts            ← unified entrypoint
  ├─ connectMongo()         ← MongoDB Atlas (persistent layer)
  ├─ startIndexer()          ← REST API + event listener (SQLite hot cache)
  ├─ startRelayer()
  ├─ startNotifier()         ← subscriptions in Mongo (SQLite fallback)
  └─ startMonitor()

api/src/models/             ← Mongoose models
  user.ts, subscription.ts, api-key.ts, creator-profile.ts, work-entry.ts
```

- **SQLite** stays as the indexer's hot cache (pools/supporters/events, rebuilds from chain).
- **MongoDB** is the persistent layer: users, subscriptions, profiles, works, API keys.

## Run

```bash
cp .env.example .env
npm install
npm run dev        # tsx watch
npm run build      # tsc
npm run start      # node dist/api/src/index.js (from repo root)
```
