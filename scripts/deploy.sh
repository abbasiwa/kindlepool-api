#!/usr/bin/env bash
set -euo pipefail

NETWORK="${1:-testnet}"
WASM="target/wasm32-unknown-unknown/release/sponsor_pool.wasm"

echo "Deploying SponsorPool to Stellar $NETWORK..."

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

soroban contract deploy \
  --wasm "$WASM" \
  --source "${SOROBAN_SECRET_KEY}" \
  --rpc-url "$RPC" \
  --network-passphrase "$PASSPHRASE" \
  --fee 100

echo "Done."
