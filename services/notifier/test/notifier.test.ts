import { beforeAll, describe, expect, it } from 'vitest'
import { Keypair } from '@stellar/stellar-sdk'
import os from 'os'
import path from 'path'
import fs from 'fs'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-notifier-test-'))
process.env.KINDPOOL_NOTIFIER_DB_PATH = path.join(tmpDir, 'test.db')

const store = await import('../src/store')
const { verifyOwnership } = await import('../src/auth')

describe('auth (F-901)', () => {
  it('accepts a valid ownership signature', () => {
    const kp = Keypair.random()
    const msg = 'challenge-nonce-123'
    const sig = kp.sign(msg).toString('hex')
    expect(verifyOwnership(kp.publicKey(), msg, sig)).toBe(true)
  })

  it('rejects a signature from the wrong key', () => {
    const kp = Keypair.random()
    const other = Keypair.random()
    const msg = 'challenge-nonce-123'
    const sig = kp.sign(msg).toString('hex')
    expect(verifyOwnership(other.publicKey(), msg, sig)).toBe(false)
  })

  it('rejects a tampered message', () => {
    const kp = Keypair.random()
    const sig = kp.sign('message-a').toString('hex')
    expect(verifyOwnership(kp.publicKey(), 'message-b', sig)).toBe(false)
  })

  it('rejects malformed signatures', () => {
    expect(verifyOwnership(Keypair.random().publicKey(), 'x', 'not-hex!!')).toBe(false)
  })
})

describe('store (F-902)', () => {
  it('upserts, reads, and deletes subscriptions', () => {
    const addr = Keypair.random().publicKey()
    store.upsertSubscription({ address: addr, email: 'a@b.com', events: ['deposit', 'pool_paid'] })
    const sub = store.getSubscription(addr)
    expect(sub?.email).toBe('a@b.com')
    expect(sub?.events).toEqual(['deposit', 'pool_paid'])
    expect(store.countSubscriptions()).toBeGreaterThan(0)

    store.upsertSubscription({ address: addr, email: 'new@b.com', events: ['deposit'] })
    expect(store.getSubscription(addr)?.email).toBe('new@b.com')

    store.deleteSubscription(addr)
    expect(store.getSubscription(addr)).toBeUndefined()
  })
})
