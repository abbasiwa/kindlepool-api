import { SorobanRpc } from '@stellar/stellar-sdk'
import { AnomalyEvent, bumpFailedAlert, deleteFailedAlert, dueFailedAlerts, enqueueFailedAlert, insertAnomaly, insertHealth, HealthRecord } from './persistence'
import { detectAnomalies } from './checks'

const CONFIG = {
  rpcUrl: process.env.KINDPOOL_MONITOR_RPC ?? 'https://soroban-testnet.stellar.org',
  indexerUrl: process.env.KINDPOOL_INDEXER_URL ?? 'http://localhost:3001',
  contractId: process.env.KINDPOOL_CONTRACT_ID ?? '',
  checkInterval: parseInt(process.env.KINDPOOL_MONITOR_INTERVAL ?? '300000', 10),
  anomalyThreshold: parseInt(process.env.KINDPOOL_ANOMALY_THRESHOLD ?? '10', 10),
  alertWebhook: process.env.KINDPOOL_ALERT_WEBHOOK ?? '',
  feeGrowthThreshold: BigInt(process.env.KINDPOOL_FEE_GROWTH_THRESHOLD ?? '100000000'),
  disputedStuckHours: parseInt(process.env.KINDPOOL_DISPUTE_STUCK_HOURS ?? '168', 10),
}

let lastPoolCount = 0
let lastFeesCollected = 0n

function deliverWebhook(a: AnomalyEvent, attemptsLeft: number): void {
  const payload = JSON.stringify({
    text: `🚨 *KindlePool Alert*\nSeverity: ${a.severity}\nType: ${a.type}\nMessage: ${a.message}`,
  })

  fetch(CONFIG.alertWebhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  })
    .then((res) => {
      if (!res.ok) throw new Error(`webhook status ${res.status}`)
      return res
    })
    .then(() => {
      console.log(`[alert] delivered ${a.type}`)
    })
    .catch(() => {
      // (F-1003) persist failed deliveries to a retry queue.
      if (attemptsLeft > 1) {
        enqueueFailedAlert(a)
        console.error(`[alert] failed ${a.type} — queued for retry`)
      } else {
        console.error(`[alert] failed ${a.type} — retries exhausted`)
      }
    })
}

function flushRetryQueue(): void {
  if (!CONFIG.alertWebhook) return
  for (const row of dueFailedAlerts()) {
    const a: AnomalyEvent = {
      timestamp: row.timestamp,
      type: row.type,
      severity: row.severity,
      message: row.message,
      data: {},
    }
    fetch(CONFIG.alertWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `🚨 *KindlePool Alert (retry)*\nSeverity: ${a.severity}\nType: ${a.type}\nMessage: ${a.message}` }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`webhook status ${res.status}`)
        deleteFailedAlert(row.id)
      })
      .catch(() => {
        bumpFailedAlert(row.id, Date.now() + 30 * 1000)
      })
  }
}

async function queryContractState(): Promise<{ paused: boolean | null; feesCollected: bigint }> {
  // Basic implementation: contract-level fee/pause checks are best-effort.
  // The monitor relies on the indexer's pool/status queries (run every tick)
  // for dispute/pool anomaly detection. Fee spike + paused checks are wired
  // in `checks.ts` and become live once a contract-state RPC helper lands.
  void CONFIG.contractId
  return { paused: null, feesCollected: 0n }
}

async function runCheck() {
  const start = Date.now()
  const record: HealthRecord = {
    timestamp: start, ledger: 0, indexerStatus: 'unknown',
    poolCount: 0, status: 'ok', latency: 0,
  }

  let rpcDown = false
  let indexerUnreachable = false
  let disputedPoolCount = 0

  try {
    const server = new SorobanRpc.Server(CONFIG.rpcUrl)
    const latest = await server.getLatestLedger()
    record.ledger = latest.sequence
  } catch (err: any) {
    record.status = 'down'
    record.error = err.message
    rpcDown = true
  }

  if (!rpcDown) {
    try {
      const idxRes = await fetch(`${CONFIG.indexerUrl}/api/v1/health`)
      const idxData: any = await idxRes.json()
      record.indexerStatus = idxData.status
    } catch {
      record.indexerStatus = 'unreachable'
      record.status = 'degraded'
      indexerUnreachable = true
    }

    try {
      const poolsRes = await fetch(`${CONFIG.indexerUrl}/api/v1/pools?limit=1`)
      const poolsData: any = await poolsRes.json()
      record.poolCount = poolsData.total ?? 0
    } catch {}

    try {
      const disputedRes = await fetch(`${CONFIG.indexerUrl}/api/v1/pools?status=disputed&limit=1`)
      const disputedData: any = await disputedRes.json()
      disputedPoolCount = disputedData.total ?? 0
    } catch {}
  }

  const contractState = await queryContractState()
  record.latency = Date.now() - start

  const anomalies = detectAnomalies({
    rpcDown,
    indexerUnreachable,
    poolCount: record.poolCount,
    previousPoolCount: lastPoolCount,
    anomalyThreshold: CONFIG.anomalyThreshold,
    contractPaused: contractState.paused,
    feesCollected: contractState.feesCollected,
    previousFeesCollected: lastFeesCollected,
    feeGrowthThreshold: CONFIG.feeGrowthThreshold,
    disputedPoolCount,
    disputedStuckHours: CONFIG.disputedStuckHours,
  })

  for (const a of anomalies) {
    insertAnomaly(a)
    console.log(`[ANOMALY][${a.severity}] ${a.message}`)
    if (a.severity !== 'info' && CONFIG.alertWebhook) deliverWebhook(a, 3)
  }

  lastPoolCount = record.poolCount
  lastFeesCollected = contractState.feesCollected

  insertHealth(record)

  const icon = record.status === 'ok' ? '✅' : record.status === 'degraded' ? '⚠️' : '❌'
  console.log(`[${new Date().toISOString()}] ${icon} RPC=${record.ledger} Indexer=${record.indexerStatus} Pools=${record.poolCount} ${record.latency}ms`)
}

function start() {
  console.log('KindlePool Monitor started')
  console.log(`  Indexer: ${CONFIG.indexerUrl}`)
  console.log(`  Interval: ${CONFIG.checkInterval / 1000}s`)
  runCheck()
  setInterval(runCheck, CONFIG.checkInterval)
  setInterval(flushRetryQueue, 300 * 1000)
}

start()
