import crypto from 'crypto'
import { getDb } from './db'
import type Database from 'better-sqlite3'

export type ApiKeyTier = 'free' | 'pro'

/** Raw DB access (used by tests). */
export function getDbRaw(): Database.Database {
  return getDb()
}

export interface ApiKeyMeta {
  keyHash: string
  keyPrefix: string
  name: string
  tier: ApiKeyTier
  rateLimit: number
  createdAt: number
}

function hashKey(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex')
}

export function createApiKey(name: string, tier: ApiKeyTier = 'free'): { plaintext: string; meta: ApiKeyMeta } {
  const plaintext = `kp_${crypto.randomBytes(24).toString('hex')}`
  const keyHash = hashKey(plaintext)
  const keyPrefix = plaintext.slice(0, 8)
  const rateLimit = tier === 'pro' ? 10000 : 100
  getDb()
    .prepare('INSERT INTO api_keys (key_hash, key_prefix, name, tier, rate_limit, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(keyHash, keyPrefix, name, tier, rateLimit, Date.now())
  return {
    plaintext,
    meta: { keyHash, keyPrefix, name, tier, rateLimit, createdAt: Date.now() },
  }
}

/** Look up a plaintext key; returns undefined if absent or revoked. */
export function lookupApiKey(plaintext: string): ApiKeyMeta | undefined {
  const row = getDb().prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hashKey(plaintext)) as
    | { key_hash: string; key_prefix: string; name: string; tier: ApiKeyTier; rate_limit: number; created_at: number; revoked_at: number | null }
    | undefined
  if (!row || row.revoked_at != null) return undefined
  return {
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    name: row.name,
    tier: row.tier,
    rateLimit: row.rate_limit,
    createdAt: row.created_at,
  }
}

export function revokeApiKey(keyHash: string): boolean {
  const res = getDb().prepare('UPDATE api_keys SET revoked_at = ? WHERE key_hash = ?').run(Date.now(), keyHash)
  return res.changes > 0
}

export function listApiKeys(): Array<{ keyHash: string; keyPrefix: string; name: string; tier: ApiKeyTier; rateLimit: number; createdAt: number }> {
  const rows = getDb().prepare('SELECT key_hash, key_prefix, name, tier, rate_limit, created_at FROM api_keys').all() as any[]
  return rows.map((r) => ({
    keyHash: r.key_hash,
    keyPrefix: r.key_prefix,
    name: r.name,
    tier: r.tier,
    rateLimit: r.rate_limit,
    createdAt: r.created_at,
  }))
}

/** Bootstrap a static dev key from env if a key with this name doesn't exist. */
export function bootstrapDevKey(plaintext: string, name = 'default-dev'): void {
  const existing = getDb().prepare('SELECT key_hash FROM api_keys WHERE name = ?').get(name)
  if (existing) return
  getDb()
    .prepare('INSERT INTO api_keys (key_hash, key_prefix, name, tier, rate_limit, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(hashKey(plaintext), plaintext.slice(0, 8), name, 'free', 100, Date.now())
}

/** Convenience for the CLI: revoke by name. */
export function revokeApiKeyByName(name: string): boolean {
  const res = getDb().prepare('UPDATE api_keys SET revoked_at = ? WHERE name = ?').run(Date.now(), name)
  return res.changes > 0
}
