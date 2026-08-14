import { beforeAll, describe, expect, it } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

// Point the DB at a throwaway file BEFORE importing db.ts.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-indexer-test-'))
process.env.KINDPOOL_DB_PATH = path.join(tmpDir, 'test.db')

const db = (await import('../src/db')).getDb()
const {
  insertEvent,
  loadCursor,
  saveCursor,
  setPoolStatus,
  upsertContractState,
  upsertPool,
  upsertSupporter,
} = await import('../src/db')

function seedPool(id: number, contractId = 'CT1') {
  upsertPool({
    contract_id: contractId,
    id,
    creator: 'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP',
    token: 'TKN',
    goal: '100000000',
    deadline: 1786720583,
    metadata_hash: 'aa',
    status: 'open',
    total_deposited: '0',
    yes_votes: '0',
    no_votes: '0',
    total_supporters: 0,
  })
}

describe('checkpoints (F-704)', () => {
  it('persists and loads a cursor', () => {
    expect(loadCursor('listener:CT1')).toBe(0)
    saveCursor('listener:CT1', 12345)
    expect(loadCursor('listener:CT1')).toBe(12345)
    saveCursor('listener:CT1', 12400)
    expect(loadCursor('listener:CT1')).toBe(12400)
  })
})

describe('supporter counting (F-702)', () => {
  it('only counts a supporter once across repeat deposits', () => {
    seedPool(1)
    const first = upsertSupporter(1, 'GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '40000000', false)
    expect(first).toBe(true)
    const second = upsertSupporter(1, 'GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '80000000', false)
    expect(second).toBe(false)
  })
})

describe('pool status transitions (F-703)', () => {
  it('marks pools disputed/appealed/cancelled', () => {
    seedPool(2)
    expect(setPoolStatus(2, 'disputed')).toBe(true)
    const row = db.prepare('SELECT status FROM pools WHERE id = 2').get() as any
    expect(row.status).toBe('disputed')
    setPoolStatus(2, 'appealed')
    expect((db.prepare('SELECT status FROM pools WHERE id = 2').get() as any).status).toBe('appealed')
    setPoolStatus(2, 'cancelled')
    expect((db.prepare('SELECT status FROM pools WHERE id = 2').get() as any).status).toBe('cancelled')
  })
})

describe('contract_state (F-703)', () => {
  it('upserts fee and pause state', () => {
    upsertContractState({ contract_id: 'CT1', fee_bps: 50, fee_treasury: 'TRSY' })
    upsertContractState({ contract_id: 'CT1', paused: 1, paused_at: 123 })
    const row = db.prepare('SELECT * FROM contract_state WHERE id = 1').get() as any
    expect(row.fee_bps).toBe(50)
    expect(row.fee_treasury).toBe('TRSY')
    expect(row.paused).toBe(1)
  })
})

describe('events', () => {
  it('inserts and reads back', () => {
    insertEvent(1, 'p_dep', '{}', 100, Date.now())
    const rows = db.prepare('SELECT * FROM events WHERE pool_id = 1').all() as any[]
    expect(rows.length).toBe(1)
  })
})
