import { AnomalyEvent } from './persistence'

export interface CheckInputs {
  rpcDown: boolean
  indexerUnreachable: boolean
  poolCount: number
  previousPoolCount: number
  anomalyThreshold: number
  contractPaused: boolean | null
  feesCollected: bigint
  previousFeesCollected: bigint
  feeGrowthThreshold: bigint
  disputedPoolCount: number
  disputedStuckHours: number
}

/**
 * Deterministic anomaly detection. Kept pure so it's trivially testable
 * (F-1002) — no I/O, returns the anomalies to raise.
 */
export function detectAnomalies(input: CheckInputs): AnomalyEvent[] {
  const now = Date.now()
  const out: AnomalyEvent[] = []

  if (input.rpcDown) {
    out.push({
      timestamp: now,
      type: 'rpc_down',
      severity: 'critical',
      message: 'Stellar RPC unreachable',
      data: {},
    })
  }

  if (input.indexerUnreachable) {
    out.push({
      timestamp: now,
      type: 'indexer_down',
      severity: 'warning',
      message: 'Indexer API is unreachable',
      data: {},
    })
  }

  if (input.previousPoolCount > 0 && input.poolCount > input.previousPoolCount + input.anomalyThreshold) {
    out.push({
      timestamp: now,
      type: 'high_pool_creation',
      severity: 'warning',
      message: `${input.poolCount - input.previousPoolCount} new pools since last check`,
      data: { previous: input.previousPoolCount, current: input.poolCount },
    })
  }

  // Contract-level: fee spike beyond threshold in one tick.
  if (input.previousFeesCollected > 0n && input.feesCollected > input.previousFeesCollected + input.feeGrowthThreshold) {
    out.push({
      timestamp: now,
      type: 'fee_spike',
      severity: 'warning',
      message: 'Fees collected grew unusually fast',
      data: {
        previous: input.previousFeesCollected.toString(),
        current: input.feesCollected.toString(),
      },
    })
  }

  // Contract-level: contract paused while pools remain active is suspicious.
  if (input.contractPaused === true && input.poolCount > 0) {
    out.push({
      timestamp: now,
      type: 'contract_paused_with_activity',
      severity: 'warning',
      message: 'Contract is paused but pools still exist',
      data: { poolCount: input.poolCount },
    })
  }

  // Contract-level: disputes stuck unresolved beyond the configured window.
  if (input.disputedPoolCount > 0 && input.disputedStuckHours > 0) {
    out.push({
      timestamp: now,
      type: 'disputes_pending',
      severity: 'info',
      message: `${input.disputedPoolCount} disputed pool(s) awaiting resolution`,
      data: { disputedCount: input.disputedPoolCount, stuckHours: input.disputedStuckHours },
    })
  }

  return out
}
