import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import mongoose, { Schema, model, models } from 'mongoose'

const MONGO_URL = process.env.KINDPOOL_MONGO_URL ?? ''
const DB_PATH = process.env.KINDPOOL_NOTIFIER_DB_PATH ?? path.join(__dirname, '..', 'data', 'notifier.db')

const useMongo = MONGO_URL !== ''

// ─── Mongo store (persistent) ─────────────────────────────────
const subscriptionSchema = new Schema(
  {
    address: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    events: { type: [String], default: [] },
  },
  { timestamps: true },
)
const MongoSubscription = models.Subscription ?? model('Subscription', subscriptionSchema)

// ─── SQLite store (fallback) ─────────────────────────────────
let db: Database.Database

function getStore(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
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

export async function upsertSubscription(sub: Subscription): Promise<void> {
  if (useMongo) {
    await MongoSubscription.findOneAndUpdate(
      { address: sub.address },
      { address: sub.address, email: sub.email, events: sub.events },
      { upsert: true, new: true },
    )
    return
  }
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

export async function getSubscription(address: string): Promise<Subscription | undefined> {
  if (useMongo) {
    const doc = await MongoSubscription.findOne({ address }).lean() as unknown as
      | { address: string; email: string; events: string[] }
      | null
    if (!doc) return undefined
    return { address: doc.address, email: doc.email, events: doc.events ?? [] }
  }
  const row = getStore().prepare('SELECT * FROM subscriptions WHERE address = ?').get(address) as
    | { address: string; email: string; events: string }
    | undefined
  if (!row) return undefined
  return { address: row.address, email: row.email, events: JSON.parse(row.events) }
}

export async function deleteSubscription(address: string): Promise<void> {
  if (useMongo) {
    await MongoSubscription.deleteOne({ address })
    return
  }
  getStore().prepare('DELETE FROM subscriptions WHERE address = ?').run(address)
}

export async function countSubscriptions(): Promise<number> {
  if (useMongo) return MongoSubscription.countDocuments()
  const row = getStore().prepare('SELECT COUNT(*) as c FROM subscriptions').get() as { c: number }
  return row.c
}

// Connect Mongo lazily when configured.
if (useMongo) {
  mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 5000 }).then(() => {
    console.log('✅ Notifier: MongoDB connected')
  }).catch((err) => {
    console.error('Notifier: MongoDB connect failed — falling back to SQLite', err.message)
    process.env.KINDPOOL_NOTIFIER_USE_SQLITE = '1'
  })
}
