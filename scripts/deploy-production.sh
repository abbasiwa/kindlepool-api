#!/usr/bin/env bash
set -euo pipefail

# KindlePool Production Deploy Script
# Usage: ./scripts/deploy-production.sh [network]
# Requires: soroban-cli, docker, docker-compose

NETWORK="${1:-testnet}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "╔═══════════════════════════════════════════╗"
echo "║     KindlePool Production Deploy          ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "Network: $NETWORK"
echo ""

# 1. Build contract
echo "▸ Building contract..."
cd "$PROJECT_DIR"
cargo build -p sponsor-pool --target wasm32-unknown-unknown --release

WASM="target/wasm32-unknown-unknown/release/sponsor_pool.wasm"
SIZE=$(wc -c < "$WASM")
echo "  WASM size: $SIZE bytes ($(( SIZE / 1024 )) KB)"

if [ "$SIZE" -gt 65536 ]; then
  echo "  ❌ WASM exceeds 64KB budget"
  exit 1
fi
echo "  ✅ Within budget"

# 2. Deploy contract
echo ""
echo "▸ Deploying contract..."

case "$NETWORK" in
  testnet)
    RPC="https://soroban-testnet.stellar.org"
    PASSPHRASE="Test SDF Network ; September 2015"
    ;;
  mainnet)
    RPC="https://soroban.stellar.org"
    PASSPHRASE="Public Global Stellar Network ; September 2015"
    ;;
  *)
    echo "Usage: $0 [testnet|mainnet]"
    exit 1
    ;;
esac

if [ -z "${SOROBAN_SECRET_KEY:-}" ]; then
  echo "  ❌ SOROBAN_SECRET_KEY not set"
  exit 1
fi

CONTRACT_ID=$(soroban contract deploy \
  --wasm "$WASM" \
  --source <(echo "$SOROBAN_SECRET_KEY") \
  --rpc-url "$RPC" \
  --network-passphrase "$PASSPHRASE" \
  --fee 100 2>&1 | tail -1) || {
  echo "  ❌ Contract deploy failed"
  exit 1
}

echo "  Contract ID: $CONTRACT_ID"

# 3. Verify deployment
echo ""
echo "▸ Verifying deployment..."
sleep 5 # Wait for ledger propagation

echo "  Checking contract availability..."
if soroban contract invoke \
  --id "$CONTRACT_ID" \
  --source <(echo "$SOROBAN_SECRET_KEY") \
  --rpc-url "$RPC" \
  --network-passphrase "$PASSPHRASE" \
  --fee 100 \
  -- get_pool \
  --pool_id 1 2>&1 | head -3; then
  echo "  ✅ Contract verified"
else
  echo "  ⚠️  Verification call failed (pool 1 may not exist yet — deploy succeeded)"
fi

# 4. Output configuration
echo ""
echo "▸ Configuration"
echo "  Contract ID: $CONTRACT_ID"
echo "  RPC URL: $RPC"
echo "  Network: $NETWORK"
echo ""
echo "▸ Set these environment variables in your deployment:"
echo "  KINDPOOL_CONTRACT_ID=$CONTRACT_ID"
echo "  KINDPOOL_RPC_URL=$RPC"
echo ""

# 5. Save to .env file
cat > .env.production << EOF
# KindlePool Production Configuration
# Generated: $(date)
# Network: $NETWORK

KINDPOOL_CONTRACT_ID=$CONTRACT_ID
KINDPOOL_RPC_URL=$RPC
KINDPOOL_NETWORK_PASSPHRASE=$PASSPHRASE
KINDPOOL_RELAYER_URL=http://relayer:3002
KINDPOOL_INDEXER_URL=http://indexer:3001
EOF

echo "  Saved to .env.production"
echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     Deploy complete!                       ║"
echo "╚═══════════════════════════════════════════╝"
