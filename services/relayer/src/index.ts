import { SorobanRpc, Keypair } from '@stellar/stellar-sdk'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import {
  RelayConfig,
  buildFeeBump,
  defaultRelayConfig,
  parseAllowlist,
  submitRelayedTx,
  validateRequest,
} from './relay'

const app = express()
const PORT = parseInt(process.env.KINDPOOL_RELAYER_PORT ?? '3002', 10)

const RELAYER_SECRET = process.env.KINDPOOL_RELAYER_SECRET
if (!RELAYER_SECRET) {
  console.error('KINDPOOL_RELAYER_SECRET environment variable is required')
  process.exit(1)
}
const relayerKeypair = Keypair.fromSecret(RELAYER_SECRET)

const config: RelayConfig = {
  ...defaultRelayConfig(),
  rpcUrl: process.env.KINDPOOL_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase: process.env.KINDPOOL_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015',
  fee: process.env.KINDPOOL_RELAYER_FEE ?? '100000',
  txbTtlSeconds: parseInt(process.env.KINDPOOL_RELAYER_TXB_TTL_SECONDS ?? '300', 10),
  allowlist: parseAllowlist(process.env.KINDPOOL_RELAYER_ALLOWLIST),
}

const server = new SorobanRpc.Server(config.rpcUrl)

app.use(cors())
app.use(express.json({ limit: '100kb' }))
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.KINDPOOL_RELAYER_RATE_LIMIT ?? '50', 10),
  standardHeaders: true,
  legacyHeaders: false,
}))

app.post('/api/v1/relay', async (req, res) => {
  try {
    const body = req.body ?? {}
    const validation = validateRequest(body, config)
    if (!validation.ok) {
      res.status(validation.status).json({ success: false, error: validation.error })
      return
    }

    // Submit the user's own signed envelope wrapped in a relayer fee-bump.
    const outcome = await submitRelayedTx(server, body.tx_xdr, config, relayerKeypair)
    if (!outcome.success) {
      res.status(500).json({ success: false, error: outcome.error })
      return
    }
    res.json({ success: true, hash: outcome.hash })
  } catch (err: any) {
    console.error('Relay error:', err)
    res.status(500).json({ success: false, error: err.message ?? 'Internal error' })
  }
})

app.get('/api/v1/health', async (_req, res) => {
  try {
    const account = await server.getAccount(relayerKeypair.publicKey())
    const balance = (account as any).balances?.find((b: any) => b.asset_type === 'native')
    res.json({
      status: 'ok',
      relayer_address: relayerKeypair.publicKey(),
      balance: balance?.balance ?? '0',
    })
  } catch {
    res.json({
      status: 'degraded',
      relayer_address: relayerKeypair.publicKey(),
      balance: 'unknown',
    })
  }
})

app.listen(PORT, () => {
  console.log(`KindlePool Relayer running on port ${PORT}`)
  console.log(`  Relayer address: ${relayerKeypair.publicKey()}`)
  console.log(`  RPC: ${config.rpcUrl}`)
  console.log(`  Network: ${config.networkPassphrase}`)
  console.log(`  Allowlist: ${config.allowlist ? config.allowlist.length + ' addresses' : 'disabled (allow all)'}`)
})
