import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.KINDPOOL_MONITOR_DB_PATH ?? path.join(__dirname, '..', 'data', 'monitor.db')

let db: Database.Database

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function getMonitorDb(): Database.Database {
  if (!db) {
    ensureDir(DB_PATH)
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS health (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        ledger INTEGER NOT NULL,
        indexer_status TEXT NOT NULL,
        pool_count INTEGER NOT NULL,
        status TEXT NOT NULL,
        latency INTEGER NOT NULL,
        error TEXT
      );

      CREATE TABLE IF NOT EXISTS anomalies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS failed_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_retry INTEGER NOT NULL
      );
    `)
  }
  return db
}

export interface HealthRecord {
  timestamp: number
  ledger: number
  indexerStatus: string
  poolCount: number
  status: 'ok' | 'degraded' | 'down'
  latency: number
  error?: string
}

export interface AnomalyEvent {
  timestamp: number
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  data: Record<string, any>
}

// (F-1001) persist every tick so data survives a crash between ticks.
export function insertHealth(record: HealthRecord) {
  getMonitorDb()
    .prepare('INSERT INTO health (timestamp, ledger, indexer_status, pool_count, status, latency, error) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(record.timestamp, record.ledger, record.indexerStatus, record.poolCount, record.status, record.latency, record.error ?? null)
  // prune to last 2016 rows (~7 days @ 5 min cadence)
  getMonitorDb().exec(`
    DELETE FROM health WHERE id NOT IN (SELECT id FROM health ORDER BY id DESC LIMIT 2016)
  `)
}

export function insertAnomaly(a: AnomalyEvent) {
  getMonitorDb()
    .prepare('INSERT INTO anomalies (timestamp, type, severity, message, data) VALUES (?, ?, ?, ?, ?)')
    .run(a.timestamp, a.type, a.severity, a.message, JSON.stringify(a.data))
  getMonitorDb().exec(`
    DELETE FROM anomalies WHERE id NOT IN (SELECT id FROM anomalies ORDER BY id DESC LIMIT 500)
  `)
}

export function recentAnomalies(hours = 24): AnomalyEvent[] {
  const since = Date.now() - hours * 3600 * 1000
  const rows = getMonitorDb().prepare('SELECT * FROM anomalies WHERE timestamp >= ? ORDER BY timestamp DESC').all(since) as any[]
  return rows.map((r) => ({ timestamp: r.timestamp, type: r.type, severity: r.severity, message: r.message, data: JSON.parse(r.data) }))
}

// (F-1003) failed-alert retry queue.
export function enqueueFailedAlert(a: AnomalyEvent) {
  getMonitorDb()
    .prepare('INSERT INTO failed_alerts (timestamp, type, severity, message, attempts, next_retry) VALUES (?, ?, ?, ?, 0, ?)')
    .run(a.timestamp, a.type, a.severity, a.message, Date.now() + 30 * 1000)
}

export function dueFailedAlerts(): any[] {
  const now = Date.now()
  return getMonitorDb().prepare('SELECT * FROM failed_alerts WHERE next_retry <= ?').all(now) as any[]
}

export function bumpFailedAlert(id: number, nextRetry: number) {
  getMonitorDb().prepare('UPDATE failed_alerts SET attempts = attempts + 1, next_retry = ? WHERE id = ?').run(nextRetry, id)
}

export function deleteFailedAlert(id: number) {
  getMonitorDb().prepare('DELETE FROM failed_alerts WHERE id = ?').run(id)
}
