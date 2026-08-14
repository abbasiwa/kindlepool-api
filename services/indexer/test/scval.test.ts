import { describe, expect, it } from 'vitest'
import { decodeEvent, toBool, toInt, toStr } from '../src/scval'
import { nativeToScVal } from '@stellar/stellar-sdk'

function symbolTopic(sym: string) {
  return nativeToScVal(sym)
}

describe('decodeEvent', () => {
  it('decodes symbol topic + map payload (p_creat shape)', () => {
    const payload = {
      pool_id: nativeToScVal(1),
      creator: nativeToScVal('GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'),
      goal: nativeToScVal(100000000n),
      deadline: nativeToScVal(1786720583n),
      token: nativeToScVal('CD2CIUPXUDF3HFTBMKBS7SKAPNUGC4V2ZWJMBA2MG6GY76BKZN7OIYEY'),
    }
    const raw = { topic: [symbolTopic('p_creat')], value: nativeToScVal(payload) }
    const { type, payload: p } = decodeEvent(raw)
    expect(type).toBe('p_creat')
    expect(toInt(p.pool_id)).toBe(1)
    expect(toInt(p.goal)).toBe(100000000)
    expect(toStr(p.deadline)).toBe('1786720583')
  })

  it('decodes bool field (p_vote shape)', () => {
    const raw = {
      topic: [symbolTopic('p_vote')],
      value: nativeToScVal({ approve: nativeToScVal(true), weight: nativeToScVal(40000000n) }),
    }
    const { type, payload } = decodeEvent(raw)
    expect(type).toBe('p_vote')
    expect(toBool(payload.approve)).toBe(true)
    expect(toStr(payload.weight)).toBe('40000000')
  })

  it('returns empty type when no topic', () => {
    const { type } = decodeEvent({ topic: [], value: null })
    expect(type).toBe('')
  })

  it('handles missing value', () => {
    const { type, payload } = decodeEvent({ topic: [symbolTopic('p_ref')], value: null })
    expect(type).toBe('p_ref')
    expect(payload).toEqual({})
  })
})

describe('normalizers', () => {
  it('toStr handles bigint, bool, buffer, string', () => {
    expect(toStr(123n)).toBe('123')
    expect(toStr(true)).toBe('true')
    expect(toStr(Buffer.from([0xaa]))).toBe('aa')
    expect(toStr('x')).toBe('x')
    expect(toStr(null)).toBe('')
  })
  it('toInt handles numeric strings and NaN', () => {
    expect(toInt('42')).toBe(42)
    expect(toInt('nope')).toBe(0)
    expect(toInt(null)).toBe(0)
  })
})
