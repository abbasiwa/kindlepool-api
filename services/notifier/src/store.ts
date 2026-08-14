import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.KINDPOOL_NOTIFIER_DB_PATH ?? path.join(__dirname, '..', 'data', 'notifier.db')

let db: Database.Database

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function getStore(): Database.Database {
  if (!db) {
    ensureDir(DB_PATH)
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        address TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        events TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
  }
  return db
}

export interface Subscription {
  address: string
  email: string
  events: string[]
}

export function upsertSubscription(sub: Subscription): void {
  getStore()
    .prepare(`
      INSERT INTO subscriptions (address, email, events, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(address) DO UPDATE SET
        email = excluded.email,
        events = excluded.events,
        updated_at = excluded.updated_at
    `)
    .run(sub.address, sub.email, JSON.stringify(sub.events), Date.now(), Date.now())
}

export function getSubscription(address: string): Subscription | undefined {
  const row = getStore().prepare('SELECT * FROM subscriptions WHERE address = ?').get(address) as
    | { address: string; email: string; events: string }
    | undefined
  if (!row) return undefined
  return { address: row.address, email: row.email, events: JSON.parse(row.events) }
}

export function deleteSubscription(address: string): void {
  getStore().prepare('DELETE FROM subscriptions WHERE address = ?').run(address)
}

export function countSubscriptions(): number {
  const row = getStore().prepare('SELECT COUNT(*) as c FROM subscriptions').get() as { c: number }
  return row.c
}
