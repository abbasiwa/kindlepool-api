import { SorobanRpc } from '@stellar/stellar-sdk'
import {
  getDb,
  insertArbitratorVote,
  insertEvent,
  insertReferral,
  loadCursor,
  saveCursor,
  setPoolStatus,
  upsertContractState,
  upsertPool,
  upsertSupporter,
} from './db'
import { decodeEvent, toBool, toInt, toStr } from './scval'

const RPC_URL = process.env.KINDPOOL_RPC_URL ?? 'https://soroban-testnet.stellar.org'
const CONTRACT_ID = process.env.KINDPOOL_CONTRACT_ID ?? ''
const POLL_INTERVAL = parseInt(process.env.KINDPOOL_POLL_INTERVAL ?? '10000', 10)
const CURSOR_KEY = `listener:${CONTRACT_ID}`

let isRunning = false
let lastLedger = 0

// All topics published by the SponsorPool contract (types.rs).
const EVENT_KEYS: Record<string, string> = {
  p_creat: 'p_creat',
  p_dep: 'p_dep',
  p_goal: 'p_goal',
  p_work: 'p_work',
  p_vote: 'p_vote',
  p_paid: 'p_paid',
  p_ref: 'p_ref',
  p_disp: 'p_disp',
  p_resl: 'p_resl',
  p_appl: 'p_appl',
  p_arbv: 'p_arbv',
  p_cancl: 'p_cancl',
  p_rclm: 'p_rclm',
  p_paue: 'p_paue',
  p_paed: 'p_paed',
  p_unps: 'p_unps',
  p_feeu: 'p_feeu',
  p_feet: 'p_feet',
  p_fees: 'p_fees',
  p_admp: 'p_admp',
  p_adma: 'p_adma',
  p_refr: 'p_refr',
}

function handleEvent(raw: any) {
  try {
    const { type, payload } = decodeEvent(raw)
    if (!EVENT_KEYS[type]) return

    const poolId = toInt(payload.pool_id)
    const ledger = raw.ledger ?? 0
    const ts = raw.ledgerClosedAt ? new Date(raw.ledgerClosedAt).getTime() : Date.now()

    switch (type) {
      case 'p_creat': {
        upsertPool({
          contract_id: CONTRACT_ID,
          id: poolId,
          creator: toStr(payload.creator),
          token: toStr(payload.token),
          goal: toStr(payload.goal),
          deadline: toInt(payload.deadline),
          metadata_hash: toStr(payload.metadata_hash),
          status: 'open',
          total_deposited: '0',
          yes_votes: '0',
          no_votes: '0',
          total_supporters: 0,
        })
        break
      }
      case 'p_dep': {
        const supporter = toStr(payload.supporter)
        const amount = toStr(payload.amount)
        // (F-702) only count the supporter once — the first deposit creates the record.
        const isNew = upsertSupporter(poolId, supporter, amount, false)
        const db = getDb()
        const existing = db.prepare('SELECT * FROM pools WHERE contract_id = ? AND id = ?').get(CONTRACT_ID, poolId) as any
        if (existing) {
          const totalDeposited = existing.total_deposited ? (BigInt(existing.total_deposited) + BigInt(amount)).toString() : amount
          if (isNew) {
            db.prepare('UPDATE pools SET total_deposited = ?, total_supporters = total_supporters + 1, updated_at = ? WHERE id = ?')
              .run(totalDeposited, Date.now(), existing.id)
          } else {
            db.prepare('UPDATE pools SET total_deposited = ?, updated_at = ? WHERE id = ?')
              .run(totalDeposited, Date.now(), existing.id)
          }
        }
        break
      }
      case 'p_goal': {
        const db = getDb()
        const existing = db.prepare('SELECT * FROM pools WHERE contract_id = ? AND id = ?').get(CONTRACT_ID, poolId) as any
        if (existing) {
          db.prepare('UPDATE pools SET total_deposited = ?, updated_at = ? WHERE id = ?')
            .run(toStr(payload.total_deposited) ?? existing.total_deposited, Date.now(), existing.id)
        }
        break
      }
      case 'p_work': {
        const db = getDb()
        const existing = db.prepare('SELECT * FROM pools WHERE contract_id = ? AND id = ?').get(CONTRACT_ID, poolId) as any
        if (existing) {
          db.prepare('UPDATE pools SET status = ?, work_hash = ?, vote_deadline = ?, updated_at = ? WHERE id = ?')
            .run('awaiting_vote', toStr(payload.work_hash), toInt(payload.vote_deadline), Date.now(), existing.id)
        }
        break
      }
      case 'p_vote': {
        const voter = toStr(payload.voter)
        const approve = toBool(payload.approve)
        const weight = toStr(payload.weight)
        upsertSupporter(poolId, voter, weight, true)
        const db = getDb()
        const existing = db.prepare('SELECT * FROM pools WHERE contract_id = ? AND id = ?').get(CONTRACT_ID, poolId) as any
        if (existing) {
          const yesVotes = approve
            ? (BigInt(existing.yes_votes || '0') + BigInt(weight)).toString()
            : existing.yes_votes
          const noVotes = !approve
            ? (BigInt(existing.no_votes || '0') + BigInt(weight)).toString()
            : existing.no_votes
          db.prepare('UPDATE pools SET yes_votes = ?, no_votes = ?, updated_at = ? WHERE id = ?')
            .run(yesVotes, noVotes, Date.now(), existing.id)
        }
        break
      }
      case 'p_paid': {
        setPoolStatus(poolId, 'paid')
        break
      }
      case 'p_ref': {
        setPoolStatus(poolId, 'expired')
        break
      }
      case 'p_disp': {
        setPoolStatus(poolId, 'disputed')
        break
      }
      case 'p_resl': {
        const resolution = toInt(payload.resolution)
        setPoolStatus(poolId, resolution === 1 ? 'paid' : 'expired')
        break
      }
      case 'p_appl': {
        setPoolStatus(poolId, 'appealed')
        break
      }
      case 'p_arbv': {
        insertArbitratorVote(
          poolId,
          toStr(payload.arbitrator),
          toBool(payload.vote_for_creator),
          toStr(payload.weight),
          ledger,
          ts
        )
        break
      }
      case 'p_cancl': {
        setPoolStatus(poolId, 'cancelled')
        break
      }
      case 'p_rclm': {
        // The contract already zeroed the supporter amount on-chain.
        const db = getDb()
        db.prepare('UPDATE supporters SET amount = 0 WHERE pool_id = ? AND address = ?')
          .run(poolId, toStr(payload.supporter))
        break
      }
      case 'p_paue': {
        upsertContractState({ contract_id: CONTRACT_ID, pause_notice_at: toInt(payload.at) })
        break
      }
      case 'p_paed': {
        upsertContractState({ contract_id: CONTRACT_ID, paused: 1, paused_at: toInt(payload.at) })
        break
      }
      case 'p_unps': {
        upsertContractState({ contract_id: CONTRACT_ID, paused: 0 })
        break
      }
      case 'p_feeu': {
        upsertContractState({ contract_id: CONTRACT_ID, fee_bps: toInt(payload.fee_bps), fee_treasury: toStr(payload.treasury) })
        break
      }
      case 'p_feet': {
        upsertContractState({ contract_id: CONTRACT_ID, fee_treasury: toStr(payload.treasury) })
        break
      }
      case 'p_fees': {
        const db = getDb()
        const state = db.prepare('SELECT fee_total FROM contract_state WHERE id = 1').get() as { fee_total: string | null } | undefined
        const current = state?.fee_total ? BigInt(state.fee_total) : 0n
        upsertContractState({ contract_id: CONTRACT_ID, fee_total: (current + BigInt(toStr(payload.amount) || '0')).toString() })
        break
      }
      case 'p_admp': {
        upsertContractState({ contract_id: CONTRACT_ID, pending_admin: toStr(payload.new) })
        break
      }
      case 'p_adma': {
        upsertContractState({ contract_id: CONTRACT_ID, admin: toStr(payload.new), pending_admin: null })
        break
      }
      case 'p_refr': {
        insertReferral(toStr(payload.referrer), toStr(payload.referee), poolId, ledger, ts)
        break
      }
    }

    insertEvent(poolId, type, JSON.stringify({ topics: [type], payload }), ledger, ts)
    console.log(`[${new Date().toISOString()}] ${type} pool=#${poolId} ledger=${ledger}`)
  } catch (err) {
    console.error('Error handling event:', err)
  }
}

export async function pollEvents() {
  if (isRunning) return
  isRunning = true

  try {
    const server = new SorobanRpc.Server(RPC_URL)

    try {
      const latestLedger = await server.getLatestLedger()
      const currentLedger = latestLedger.sequence
      // (F-704) resume from the persisted cursor; fall back to the last 100 ledgers on first run.
      const persisted = loadCursor(CURSOR_KEY)
      const startLedger = persisted > 0 ? persisted + 1 : currentLedger - 100

      if (startLedger >= currentLedger) {
        lastLedger = currentLedger
        isRunning = false
        return
      }

      const response = await server.getEvents({
        startLedger,
        filters: [{
          type: 'contract' as any,
          contractIds: [CONTRACT_ID],
        }],
        limit: 100,
      })

      const events = (response as any).events ?? []
      for (const event of events) {
        handleEvent(event)
      }

      lastLedger = currentLedger
      saveCursor(CURSOR_KEY, currentLedger)
      console.log(`[${new Date().toISOString()}] Polled ledgers ${startLedger}-${currentLedger}, ${events.length} events`)
    } catch (err) {
      console.error('Event fetch error:', err)
    }
  } catch (err) {
    console.error('Poll error:', err)
  }

  isRunning = false
}

export function startEventListener() {
  console.log(`Listening on contract ${CONTRACT_ID} @ ${RPC_URL}`)
  pollEvents()
  setInterval(pollEvents, POLL_INTERVAL)
}
