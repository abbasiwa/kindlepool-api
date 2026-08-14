import { scValToNative } from '@stellar/stellar-sdk'

/**
 * Decode a Soroban RPC event into { type, payload }.
 *
 * KindlePool events publish a single symbol topic and a map payload:
 *   env.events().publish((TOPIC,), EventStruct)
 * so the RPC event's `topic[0]` is the symbol (string) and `value` is a
 * map of field -> native value. The old listener treated topics[1..N] as
 * fields, which silently NaN'd on scval objects (F-701).
 */
export function decodeEvent(raw: any): { type: string; payload: Record<string, any> } {
  const topic = raw?.topic ?? []
  const symbol = topic.length > 0 ? String(scValToNative(topic[0])) : ''
  const payload = (raw?.value != null ? scValToNative(raw.value) : {}) ?? {}
  return { type: symbol, payload }
}

/** Normalize a decoded payload field to a string (BigInt safe). */
export function toStr(v: any): string {
  if (v == null) return ''
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'boolean') return String(v)
  if (Buffer.isBuffer(v)) return v.toString('hex')
  return String(v)
}

/** Normalize to an integer. */
export function toInt(v: any): number {
  const s = toStr(v)
  const n = parseInt(s, 10)
  return Number.isNaN(n) ? 0 : n
}

/** Normalize to a boolean. */
export function toBool(v: any): boolean {
  if (typeof v === 'boolean') return v
  return toStr(v) === 'true'
}
