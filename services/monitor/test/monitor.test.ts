import { describe, expect, it } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-monitor-test-'))
process.env.KINDPOOL_MONITOR_DB_PATH = path.join(tmpDir, 'test.db')

const pers = await import('../src/persistence')
const { detectAnomalies } = await import('../src/checks')

const baseInput = {
  rpcDown: false,
  indexerUnreachable: false,
  poolCount: 5,
  previousPoolCount: 5,
  anomalyThreshold: 10,
  contractPaused: null,
  feesCollected: 100n,
  previousFeesCollected: 100n,
  feeGrowthThreshold: 100n,
  disputedPoolCount: 0,
  disputedStuckHours: 168,
}

describe('detectAnomalies (F-1002)', () => {
  it('returns no anomalies on a healthy state', () => {
    expect(detectAnomalies(baseInput)).toHaveLength(0)
  })

  it('flags rpc down as critical', () => {
    const out = detectAnomalies({ ...baseInput, rpcDown: true })
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('rpc_down')
    expect(out[0].severity).toBe('critical')
  })

  it('flags indexer down', () => {
    const out = detectAnomalies({ ...baseInput, indexerUnreachable: true })
    expect(out.some((a) => a.type === 'indexer_down')).toBe(true)
  })

  it('flags high pool creation rate', () => {
    const out = detectAnomalies({ ...baseInput, poolCount: 50 })
    expect(out.some((a) => a.type === 'high_pool_creation')).toBe(true)
  })

  it('flags a fee spike', () => {
    const out = detectAnomalies({ ...baseInput, feesCollected: 1000000n })
    expect(out.some((a) => a.type === 'fee_spike')).toBe(true)
  })

  it('flags paused contract with active pools', () => {
    const out = detectAnomalies({ ...baseInput, contractPaused: true })
    expect(out.some((a) => a.type === 'contract_paused_with_activity')).toBe(true)
  })

  it('flags pending disputes', () => {
    const out = detectAnomalies({ ...baseInput, disputedPoolCount: 3 })
    expect(out.some((a) => a.type === 'disputes_pending')).toBe(true)
  })
})

describe('persistence (F-1001)', () => {
  it('persists health records across re-imports (sqlite)', () => {
    pers.insertHealth({ timestamp: Date.now(), ledger: 100, indexerStatus: 'ok', poolCount: 5, status: 'ok', latency: 3 })
    const rows = pers.getMonitorDb().prepare('SELECT * FROM health').all()
    expect(rows.length).toBe(1)
    expect((rows[0] as any).ledger).toBe(100)
  })

  it('persists anomalies and lists recent ones', () => {
    pers.insertAnomaly({ timestamp: Date.now(), type: 'rpc_down', severity: 'critical', message: 'x', data: {} })
    const recent = pers.recentAnomalies(1)
    expect(recent.length).toBeGreaterThan(0)
    expect(recent[0].type).toBe('rpc_down')
  })
})

describe('failed-alert retry queue (F-1003)', () => {
  it('enqueues, bumps attempts, and deletes', () => {
    pers.enqueueFailedAlert({ timestamp: Date.now(), type: 'fee_spike', severity: 'warning', message: 'x', data: {} })
    const row = pers.getMonitorDb().prepare('SELECT * FROM failed_alerts').get() as any
    expect(row).toBeTruthy()
    expect(row.attempts).toBe(0)
    pers.bumpFailedAlert(row.id, Date.now() + 60000)
    expect((pers.getMonitorDb().prepare('SELECT attempts FROM failed_alerts WHERE id = ?').get(row.id) as any).attempts).toBe(1)
    pers.deleteFailedAlert(row.id)
    expect(pers.getMonitorDb().prepare('SELECT * FROM failed_alerts').all().length).toBe(0)
  })
})
