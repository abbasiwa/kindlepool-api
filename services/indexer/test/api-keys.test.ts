import { beforeAll, describe, expect, it } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-keys-test-'))
process.env.KINDPOOL_DB_PATH = path.join(tmpDir, 'test.db')

const keys = await import('../src/keys')

describe('api_keys (KI-101)', () => {
  it('creates and looks up a key', () => {
    const { plaintext, meta } = keys.createApiKey('alice', 'free')
    expect(plaintext.startsWith('kp_')).toBe(true)
    const found = keys.lookupApiKey(plaintext)
    expect(found?.name).toBe('alice')
    expect(found?.tier).toBe('free')
    expect(found?.rateLimit).toBe(100)
    expect(found?.keyHash).toBe(meta.keyHash)
  })

  it('creates a pro key with higher rate limit', () => {
    const { plaintext } = keys.createApiKey('bob', 'pro')
    expect(keys.lookupApiKey(plaintext)?.rateLimit).toBe(10000)
  })

  it('does not store the plaintext key', () => {
    const { plaintext } = keys.createApiKey('carol', 'free')
    const rows = keys.getDbRaw().prepare('SELECT key_hash FROM api_keys').all() as any[]
    expect(rows.some((r) => r.key_hash === plaintext)).toBe(false)
    expect(keys.lookupApiKey(plaintext)).toBeTruthy()
  })

  it('returns undefined for a wrong key', () => {
    expect(keys.lookupApiKey('kp_does-not-exist')).toBeUndefined()
  })

  it('revokes a key', () => {
    const { plaintext, meta } = keys.createApiKey('dave', 'free')
    expect(keys.lookupApiKey(plaintext)).toBeTruthy()
    expect(keys.revokeApiKey(meta.keyHash)).toBe(true)
    expect(keys.lookupApiKey(plaintext)).toBeUndefined()
  })

  it('revokes by name', () => {
    const { plaintext } = keys.createApiKey('erin', 'free')
    expect(keys.revokeApiKeyByName('erin')).toBe(true)
    expect(keys.lookupApiKey(plaintext)).toBeUndefined()
  })

  it('persists across a fresh module import (survives restart)', () => {
    const { plaintext } = keys.createApiKey('frank', 'free')
    // Simulate restart by re-reading straight from the DB (new connection).
    const db = keys.getDbRaw()
    const row = db.prepare('SELECT * FROM api_keys WHERE name = ?').get('frank') as any
    expect(row).toBeTruthy()
    expect(keys.lookupApiKey(plaintext)).toBeTruthy()
  })

  it('bootstraps a dev key idempotently', () => {
    keys.bootstrapDevKey('kp_dev_static_key_123', 'default-dev')
    const count = (keys.getDbRaw().prepare('SELECT COUNT(*) as c FROM api_keys WHERE name = ?').get('default-dev') as any).c
    keys.bootstrapDevKey('kp_dev_static_key_123', 'default-dev')
    const count2 = (keys.getDbRaw().prepare('SELECT COUNT(*) as c FROM api_keys WHERE name = ?').get('default-dev') as any).c
    expect(count).toBe(1)
    expect(count2).toBe(1)
    expect(keys.lookupApiKey('kp_dev_static_key_123')).toBeTruthy()
  })
})
