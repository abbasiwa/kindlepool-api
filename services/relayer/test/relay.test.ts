import { describe, expect, it } from 'vitest'
import {
  TransactionBuilder,
  Networks,
  Operation,
  Keypair,
  SorobanRpc,
  Account,
} from '@stellar/stellar-sdk'
import {
  RelayConfig,
  buildFeeBump,
  defaultRelayConfig,
  parseAllowlist,
  submitRelayedTx,
  validateRequest,
} from '../src/relay'

function userSignedTx(secret: string, memo: string): { xdr: string; source: string } {
  const kp = Keypair.fromSecret(secret)
  const account = new Account(kp.publicKey(), '1')
  const tx = new TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: Math.floor(Date.now() / 1000) + 300 },
  })
    .addOperation(Operation.manageData({ name: 'test', value: Buffer.from(memo) }))
    .build()
  tx.sign(kp)
  return { xdr: tx.toXDR(), source: kp.publicKey() }
}

function cfg(overrides: Partial<RelayConfig> = {}): RelayConfig {
  return { ...defaultRelayConfig(), ...overrides }
}

describe('validateRequest', () => {
  const alice = Keypair.random()

  it('rejects missing fields', () => {
    const r = validateRequest({ tx_xdr: '', source_address: '' }, cfg())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('rejects invalid XDR', () => {
    const r = validateRequest({ tx_xdr: 'not-base64!!!', source_address: alice.publicKey() }, cfg())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('rejects an unsigned transaction', () => {
    const account = new Account(alice.publicKey(), '1')
    const tx = new TransactionBuilder(account, {
      fee: '100000',
      networkPassphrase: Networks.TESTNET,
      timebounds: { minTime: 0, maxTime: Math.floor(Date.now() / 1000) + 300 },
    })
      .addOperation(Operation.manageData({ name: 'x', value: Buffer.from('y') }))
      .build()
    const r = validateRequest({ tx_xdr: tx.toXDR(), source_address: alice.publicKey() }, cfg())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('not signed')
  })

  it('rejects source_address that does not match the tx source', () => {
    const other = Keypair.random()
    const { xdr } = userSignedTx(other.secret(), 'hi')
    const r = validateRequest({ tx_xdr: xdr, source_address: alice.publicKey() }, cfg())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it('rejects address not on the allowlist', () => {
    const { xdr, source } = userSignedTx(alice.secret(), 'hi')
    const r = validateRequest({ tx_xdr: xdr, source_address: source }, cfg({ allowlist: ['GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(403)
  })

  it('accepts a valid signed tx with matching source (allowlist disabled)', () => {
    const { xdr, source } = userSignedTx(alice.secret(), 'hi')
    const r = validateRequest({ tx_xdr: xdr, source_address: source }, cfg({ allowlist: null }))
    expect(r.ok).toBe(true)
  })

  it('accepts a valid signed tx on the allowlist', () => {
    const { xdr, source } = userSignedTx(alice.secret(), 'hi')
    const r = validateRequest({ tx_xdr: xdr, source_address: source }, cfg({ allowlist: [source] }))
    expect(r.ok).toBe(true)
  })
})

describe('buildFeeBump', () => {
  it('wraps the user tx in a fee-bump signed by the relayer', () => {
    const alice = Keypair.random()
    const relayer = Keypair.random()
    const { xdr } = userSignedTx(alice.secret(), 'hi')
    const fb = buildFeeBump(xdr, cfg(), relayer)
    const decoded = TransactionBuilder.fromXDR(fb.toXDR(), Networks.TESTNET)
    expect(decoded.feeSource).toBe(relayer.publicKey())
    expect(decoded.signatures.length).toBeGreaterThan(0)
  })
})

describe('parseAllowlist', () => {
  it('returns null when unset', () => {
    expect(parseAllowlist(undefined)).toBeNull()
  })
  it('parses comma-separated addresses', () => {
    const a = Keypair.random().publicKey()
    const b = Keypair.random().publicKey()
    const list = parseAllowlist(`${a}, ${b},`)
    expect(list).toEqual([a, b])
  })
})

describe('submitRelayedTx', () => {
  it('returns timeout error when a mock server never confirms', async () => {
    const server = {
      sendTransaction: async () => ({ status: 'PENDING', hash: '0xabc' }),
      getTransaction: async () => ({ status: 'NOT_FOUND' }),
    } as unknown as SorobanRpc.Server
    const relayer = Keypair.random()
    const alice = Keypair.random()
    const { xdr } = userSignedTx(alice.secret(), 'hi')
    const outcome = await submitRelayedTx(server, xdr, cfg(), relayer, 2)
    expect(outcome.success).toBe(false)
  })
})
