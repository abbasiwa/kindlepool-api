# KindlePool Indexer

Off-chain event listener + REST API for the SponsorPool contract.

## Notes

- **Single-contract MVP (F-705)**: `pools.id` is both the AUTOINCREMENT row id and the on-chain pool id. This is fine for indexing one contract. Multi-contract indexing would collide on the PRIMARY KEY — switch to a `(contract_id, pool_id)` composite key before adding a second contract.
- **Events** are decoded from the RPC `value` map (each event publishes a symbol topic + a struct payload). See `src/scval.ts`.
- **Cursor**: the listener persists its ledger cursor in the `checkpoints` table so restarts resume without duplicates or gaps (F-704).
- **Statuses**: pools map to `open | awaiting_vote | paid | expired | disputed | appealed | cancelled`.

## Run

```bash
cp .env.example .env      # set KINDPOOL_CONTRACT_ID
npm install
npm run dev               # development
npm run build && npm start  # production
```

## Test

```bash
npm test
```
