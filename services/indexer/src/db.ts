import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import type { PoolRow, SupporterRow, EventRow, PoolListQuery, PaginatedResponse, PoolStatus } from './types'

const DB_PATH = process.env.KINDPOOL_DB_PATH ?? path.join(__dirname, '..', 'data', 'kindlepool.db')

let db: Database.Database

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function getDb(): Database.Database {
  if (!db) {
    ensureDir(DB_PATH)
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate()
  }
  return db
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id TEXT NOT NULL,
      creator TEXT NOT NULL,
      token TEXT NOT NULL,
      goal TEXT NOT NULL,
      total_deposited TEXT NOT NULL DEFAULT '0',
      deadline INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      work_hash TEXT,
      vote_deadline INTEGER,
      yes_votes TEXT NOT NULL DEFAULT '0',
      no_votes TEXT NOT NULL DEFAULT '0',
      metadata_hash TEXT NOT NULL,
      total_supporters INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(contract_id, id)
    );

    CREATE TABLE IF NOT EXISTS supporters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_id INTEGER NOT NULL REFERENCES pools(id),
      address TEXT NOT NULL,
      amount TEXT NOT NULL DEFAULT '0',
      voted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(pool_id, address)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_id INTEGER NOT NULL REFERENCES pools(id),
      event_type TEXT NOT NULL,
      data TEXT NOT NULL,
      ledger INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkpoints (
      key TEXT PRIMARY KEY,
      last_ledger INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contract_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      contract_id TEXT NOT NULL,
      admin TEXT,
      pending_admin TEXT,
      fee_bps INTEGER,
      fee_total TEXT,
      fee_treasury TEXT,
      paused INTEGER NOT NULL DEFAULT 0,
      paused_at INTEGER,
      pause_notice_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS arbitrator_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pool_id INTEGER NOT NULL,
      address TEXT NOT NULL,
      vote_for_creator INTEGER NOT NULL,
      weight TEXT NOT NULL,
      ledger INTEGER NOT NULL,
      ts INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer TEXT NOT NULL,
      referee TEXT NOT NULL,
      pool_id INTEGER NOT NULL,
      ledger INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      UNIQUE(referrer, referee, pool_id)
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      key_hash TEXT PRIMARY KEY,
      key_prefix TEXT NOT NULL,
      name TEXT NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('free','pro')),
      rate_limit INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_pools_status ON pools(status);
    CREATE INDEX IF NOT EXISTS idx_pools_creator ON pools(creator);
    CREATE INDEX IF NOT EXISTS idx_pools_deadline ON pools(deadline);
    CREATE INDEX IF NOT EXISTS idx_supporters_pool ON supporters(pool_id);
    CREATE INDEX IF NOT EXISTS idx_supporters_address ON supporters(address);
    CREATE INDEX IF NOT EXISTS idx_events_pool ON events(pool_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_arbitrator_pool ON arbitrator_votes(pool_id);
    CREATE INDEX IF NOT EXISTS idx_referrals_pool ON referrals(pool_id);
  `)
}

export function upsertPool(pool: {
  contract_id: string
  id: number
  creator: string
  token: string
  goal: string
  total_deposited?: string
  deadline?: number
  status?: PoolStatus
  work_hash?: string | null
  vote_deadline?: number | null
  yes_votes?: string
  no_votes?: string
  metadata_hash?: string
  total_supporters?: number
}) {
  const existing = db.prepare('SELECT id FROM pools WHERE contract_id = ? AND id = ?').get(pool.contract_id, pool.id) as { id: number } | undefined

  if (existing) {
    db.prepare(`
      UPDATE pools SET
        total_deposited = ?, status = ?, work_hash = ?, vote_deadline = ?,
        yes_votes = ?, no_votes = ?, total_supporters = ?, updated_at = ?
      WHERE id = ?
    `).run(
      pool.total_deposited, pool.status, pool.work_hash, pool.vote_deadline,
      pool.yes_votes, pool.no_votes, pool.total_supporters, Date.now(),
      existing.id
    )
  } else {
    db.prepare(`
      INSERT INTO pools (contract_id, creator, token, goal, total_deposited, deadline, status,
        work_hash, vote_deadline, yes_votes, no_votes, metadata_hash, total_supporters, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pool.contract_id, pool.creator, pool.token, pool.goal, pool.total_deposited,
      pool.deadline, pool.status, pool.work_hash, pool.vote_deadline,
      pool.yes_votes, pool.no_votes, pool.metadata_hash, pool.total_supporters,
      Date.now(), Date.now()
    )
  }
}

/** Upsert a supporter record. Returns true if the supporter was newly created (F-702). */
export function upsertSupporter(poolId: number, address: string, amount: string, voted: boolean): boolean {
  const existing = db.prepare('SELECT id FROM supporters WHERE pool_id = ? AND address = ?').get(poolId, address) as { id: number } | undefined

  if (existing) {
    db.prepare('UPDATE supporters SET amount = ?, voted = ? WHERE id = ?').run(amount, voted ? 1 : 0, existing.id)
    return false
  } else {
    db.prepare('INSERT INTO supporters (pool_id, address, amount, voted, created_at) VALUES (?, ?, ?, ?, ?)').run(poolId, address, amount, voted ? 1 : 0, Date.now())
    return true
  }
}

export function insertEvent(poolId: number, eventType: string, data: string, ledger: number, ts: number) {
  db.prepare('INSERT INTO events (pool_id, event_type, data, ledger, ts, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(poolId, eventType, data, ledger, ts, Date.now())
}

export function queryPools(q: PoolListQuery): PaginatedResponse<PoolRow> {
  const page = q.page ?? 1
  const limit = Math.min(q.limit ?? 20, 100)
  const offset = (page - 1) * limit

  const conditions: string[] = []
  const params: any[] = []

  if (q.status) {
    conditions.push('status = ?')
    params.push(q.status)
  }
  if (q.creator) {
    conditions.push('creator = ?')
    params.push(q.creator)
  }

  let orderBy = 'created_at DESC'
  if (q.sort === 'ending_soon') orderBy = 'deadline ASC'
  else if (q.sort === 'most_funded') orderBy = 'CAST(total_deposited AS INTEGER) DESC'

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const total = (db.prepare(`SELECT COUNT(*) as count FROM pools ${where}`).get(...params) as { count: number }).count
  const data = db.prepare(`SELECT * FROM pools ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, limit, offset) as PoolRow[]

  return {
    data,
    page,
    limit,
    total,
    total_pages: Math.ceil(total / limit),
  }
}

export function getPoolById(poolId: number): PoolRow | undefined {
  return db.prepare('SELECT * FROM pools WHERE id = ?').get(poolId) as PoolRow | undefined
}

export function getSupportersByPool(poolId: number): SupporterRow[] {
  return db.prepare('SELECT * FROM supporters WHERE pool_id = ? ORDER BY CAST(amount AS INTEGER) DESC').all(poolId) as SupporterRow[]
}

export function getPoolsBySupporter(address: string): PoolRow[] {
  return db.prepare(`
    SELECT p.* FROM pools p
    INNER JOIN supporters s ON s.pool_id = p.id
    WHERE s.address = ?
    ORDER BY p.updated_at DESC
  `).all(address) as PoolRow[]
}

export function getPoolsByCreator(address: string): PoolRow[] {
  return db.prepare('SELECT * FROM pools WHERE creator = ? ORDER BY created_at DESC').all(address) as PoolRow[]
}

export function getEvents(poolId?: number, eventType?: string, limit = 50): EventRow[] {
  const conditions: string[] = []
  const params: any[] = []
  if (poolId) { conditions.push('pool_id = ?'); params.push(poolId) }
  if (eventType) { conditions.push('event_type = ?'); params.push(eventType) }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM events ${where} ORDER BY ts DESC LIMIT ?`).all(...params, limit) as EventRow[]
}

// ─── Checkpoint cursor (F-704) ────────────────────────────────

export function loadCursor(key: string): number {
  const row = db.prepare('SELECT last_ledger FROM checkpoints WHERE key = ?').get(key) as { last_ledger: number } | undefined
  return row?.last_ledger ?? 0
}

export function saveCursor(key: string, lastLedger: number) {
  db.prepare(`
    INSERT INTO checkpoints (key, last_ledger, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET last_ledger = excluded.last_ledger, updated_at = excluded.updated_at
  `).run(key, lastLedger, Date.now())
}

// ─── Contract state (F-703) ───────────────────────────────────

export interface ContractStateRow {
  contract_id: string
  admin: string | null
  pending_admin: string | null
  fee_bps: number | null
  fee_total: string | null
  fee_treasury: string | null
  paused: number
  paused_at: number | null
  pause_notice_at: number | null
}

export function upsertContractState(state: Partial<ContractStateRow>) {
  db.prepare(`
    INSERT INTO contract_state (id, contract_id, admin, pending_admin, fee_bps, fee_total, fee_treasury,
      paused, paused_at, pause_notice_at, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      contract_id = excluded.contract_id,
      admin = COALESCE(excluded.admin, contract_state.admin),
      pending_admin = COALESCE(excluded.pending_admin, contract_state.pending_admin),
      fee_bps = COALESCE(excluded.fee_bps, contract_state.fee_bps),
      fee_total = COALESCE(excluded.fee_total, contract_state.fee_total),
      fee_treasury = COALESCE(excluded.fee_treasury, contract_state.fee_treasury),
      paused = excluded.paused,
      paused_at = COALESCE(excluded.paused_at, contract_state.paused_at),
      pause_notice_at = COALESCE(excluded.pause_notice_at, contract_state.pause_notice_at),
      updated_at = excluded.updated_at
  `).run(
    state.contract_id ?? '',
    state.admin ?? null,
    state.pending_admin ?? null,
    state.fee_bps ?? null,
    state.fee_total ?? null,
    state.fee_treasury ?? null,
    state.paused ?? 0,
    state.paused_at ?? null,
    state.pause_notice_at ?? null,
    Date.now()
  )
}

export function insertArbitratorVote(poolId: number, address: string, forCreator: boolean, weight: string, ledger: number, ts: number) {
  db.prepare('INSERT INTO arbitrator_votes (pool_id, address, vote_for_creator, weight, ledger, ts) VALUES (?, ?, ?, ?, ?, ?)')
    .run(poolId, address, forCreator ? 1 : 0, weight, ledger, ts)
}

export function insertReferral(referrer: string, referee: string, poolId: number, ledger: number, ts: number) {
  db.prepare('INSERT OR IGNORE INTO referrals (referrer, referee, pool_id, ledger, ts) VALUES (?, ?, ?, ?, ?)')
    .run(referrer, referee, poolId, ledger, ts)
}

/** Set a pool status. Returns true if a row was updated. */
export function setPoolStatus(poolId: number, status: PoolStatus): boolean {
  const res = db.prepare('UPDATE pools SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), poolId)
  return res.changes > 0
}

if (require.main === module) {
  getDb()
  console.log('Database migrated at:', DB_PATH)
}
