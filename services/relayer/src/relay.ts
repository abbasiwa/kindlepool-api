import { SorobanRpc, Transaction, TransactionBuilder, Keypair, Networks } from '@stellar/stellar-sdk'

export interface RelayConfig {
  rpcUrl: string
  networkPassphrase: string
  fee: string
  txbTtlSeconds: number
  allowlist: string[] | null
}

export interface RelayRequest {
  tx_xdr: string
  source_address: string
}

export type RelayValidationError =
  | { ok: false; status: number; error: string }
  | { ok: true }

export function decodeUserTx(xdr: string, networkPassphrase: string): Transaction | null {
  try {
    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase)
    return tx instanceof Transaction ? tx : null
  } catch {
    return null
  }
}

export function validateRequest(
  body: RelayRequest,
  config: RelayConfig
): RelayValidationError {
  if (!body.tx_xdr || !body.source_address) {
    return { ok: false, status: 400, error: 'Missing tx_xdr or source_address' }
  }

  const userTx = decodeUserTx(body.tx_xdr, config.networkPassphrase)
  if (!userTx) {
    return { ok: false, status: 400, error: 'Invalid transaction XDR' }
  }

  if (userTx.signatures.length === 0) {
    return { ok: false, status: 400, error: 'Transaction is not signed' }
  }

  if (userTx.source !== body.source_address) {
    return {
      ok: false,
      status: 400,
      error: `source_address does not match tx source (${userTx.source})`,
    }
  }

  if (config.allowlist && config.allowlist.length > 0) {
    if (!config.allowlist.includes(body.source_address)) {
      return { ok: false, status: 403, error: 'Address not allowlisted' }
    }
  }

  return { ok: true }
}

export function buildFeeBump(
  userTxXdr: string,
  config: RelayConfig,
  relayer: Keypair
): ReturnType<typeof TransactionBuilder.buildFeeBumpTransaction> {
  const userTx = decodeUserTx(userTxXdr, config.networkPassphrase)
  if (!userTx) throw new Error('Invalid transaction XDR')
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    relayer,
    config.fee,
    userTx,
    config.networkPassphrase
  )
  feeBump.sign(relayer)
  return feeBump
}

export async function submitRelayedTx(
  server: SorobanRpc.Server,
  userTxXdr: string,
  config: RelayConfig,
  relayer: Keypair,
  maxAttempts = 15
): Promise<{ success: true; hash: string } | { success: false; error: string }> {
  const feeBump = buildFeeBump(userTxXdr, config, relayer)
  const result = await server.sendTransaction(feeBump)

  if (result.status !== 'PENDING') {
    return { success: false, error: `Transaction rejected: ${result.status}` }
  }

  const hash = result.hash
  if (!hash) {
    return { success: false, error: 'No transaction hash returned' }
  }

  let attempts = 0
  while (attempts < maxAttempts) {
    const delay = Math.min(1000 * Math.pow(1.5, attempts), 15000)
    await new Promise((r) => setTimeout(r, delay))
    const receipt = await server.getTransaction(hash)
    if (receipt.status === 'SUCCESS') return { success: true, hash }
    if (receipt.status === 'FAILED') return { success: false, error: 'Transaction failed' }
    attempts++
  }
  return { success: false, error: 'Transaction timeout' }
}

export function parseAllowlist(raw: string | undefined): string[] | null {
  if (!raw) return null
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length > 0 ? list : null
}

export function defaultRelayConfig(): RelayConfig {
  return {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    fee: '100000',
    txbTtlSeconds: 300,
    allowlist: null,
  }
}
