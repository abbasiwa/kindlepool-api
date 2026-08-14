import { check, createPool, invoke, pace, poolState, results, sleep, usdcBalance, usdcInvoke, USDC, CT, NET, ATT, SUPB, SUPC } from './harness'

// ── Suite runners ────────────────────────────────────────────────

async function s1_happy_path_approve_payout() {
  console.log('▶ S1: Happy path — approve → payout + fee')
  invoke('kindlepool-deployer', 'set_fee', '--caller GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP', '--fee_bps 50', '--treasury GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA')
  await pace()
  const pid = createPool(100000000, 120)
  check('S1', 'create', '\\d+', String(pid))
  invoke('attacker', 'deposit', `--pool_id ${pid}`, `--supporter ${'GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D'}`, '--amount 40000000')
  invoke('sup-b', 'deposit', `--pool_id ${pid}`, `--supporter ${'GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA'}`, '--amount 35000000')
  invoke('sup-c', 'deposit', `--pool_id ${pid}`, `--supporter ${'GA4HESRPSVM7PLTCJOC5OTA2FNZIUKG5EJ5W6EAVSHEH52VNLFY7AVHA'}`, '--amount 25000000')
  await sleep(4000)
  let p = poolState(pid)
  check('S1', 'deposits=100M', '"total_deposited":"100000000"', JSON.stringify(p))
  invoke('kindlepool-deployer', 'submit_work', `--pool_id ${pid}`, `--work_hash ${'2222222222222222222222222222222222222222222222222222222222222222'}`)
  invoke('attacker', 'vote', `--pool_id ${pid}`, `--voter ${'GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D'}`, '--approve true')
  invoke('sup-b', 'vote', `--pool_id ${pid}`, `--voter ${'GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA'}`, '--approve true')
  invoke('sup-c', 'vote', `--pool_id ${pid}`, `--voter ${'GA4HESRPSVM7PLTCJOC5OTA2FNZIUKG5EJ5W6EAVSHEH52VNLFY7AVHA'}`, '--approve true')
  p = poolState(pid)
  check('S1', 'votes yes=100M', '"yes_votes":"100000000"', JSON.stringify(p))
  // Wait for pool deadline (120s) to unlock finalize
  await sleep(125000)
  const creatorBefore = usdcBalance('GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP')
  const out = invoke('kindlepool-deployer', 'finalize', `--pool_id ${pid}`)
  check('S1', 'finalize success', 'Success', out.includes('Success') ? 'Success' : out)
  p = poolState(pid)
  check('S1', 'pool paid', '"status":2', JSON.stringify(p))
  await sleep(6000)
  const creatorAfter = usdcBalance('GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP')
  // Payout 100M minus 0.5% fee (500K) = 99.5M
  check('S1', 'payout 99.5M', '99500000', String(creatorAfter - creatorBefore))
}

async function s2_reject_refund() {
  console.log('▶ S2: Reject → pro-rata refunds')
  const pid = createPool(100000000, 120)
  invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 60000000')
  invoke('sup-b', 'deposit', `--pool_id ${pid}`, '--supporter GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', '--amount 40000000')
  await sleep(4000)
  invoke('kindlepool-deployer', 'submit_work', `--pool_id ${pid}`, `--work_hash ${'2222222222222222222222222222222222222222222222222222222222222222'}`)
  invoke('attacker', 'vote', `--pool_id ${pid}`, '--voter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--approve false')
  invoke('sup-b', 'vote', `--pool_id ${pid}`, '--voter GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', '--approve false')
  await sleep(125000)
  const aBefore = usdcBalance('GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D')
  const out = invoke('kindlepool-deployer', 'finalize', `--pool_id ${pid}`)
  check('S2', 'finalize success', 'Success', out.includes('Success') ? 'Success' : out)
  const p = poolState(pid)
  check('S2', 'pool expired', '"status":3', JSON.stringify(p))
  await sleep(6000)
  const aAfter = usdcBalance('GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D')
  check('S2', 'supporter A refunded 60M', '60000000', String(aAfter - aBefore))
}

async function s3_expiry_refund() {
  console.log('▶ S3: Goal not met → expiry refunds')
  const pid = createPool(100000000, 90)
  invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 30000000')
  await sleep(95000)
  const aBefore = usdcBalance('GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D')
  const out = invoke('kindlepool-deployer', 'finalize', `--pool_id ${pid}`)
  check('S3', 'finalize success', 'Success', out.includes('Success') ? 'Success' : out)
  const p = poolState(pid)
  check('S3', 'pool expired', '"status":3', JSON.stringify(p))
  await sleep(6000)
  const aAfter = usdcBalance('GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D')
  check('S3', 'refunded 30M', '30000000', String(aAfter - aBefore))
}

async function s4_dispute_creator_wins() {
  console.log('▶ S4: Dispute — arbitrate 2-1 → creator paid')
  const pid = createPool(100000000, 300)
  invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 50000000')
  invoke('sup-b', 'deposit', `--pool_id ${pid}`, '--supporter GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', '--amount 50000000')
  await sleep(4000)
  invoke('kindlepool-deployer', 'submit_work', `--pool_id ${pid}`, `--work_hash ${'2222222222222222222222222222222222222222222222222222222222222222'}`)
  invoke('attacker', 'vote', `--pool_id ${pid}`, '--voter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--approve false')
  invoke('sup-b', 'vote', `--pool_id ${pid}`, '--voter GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', '--approve false')
  // Raise dispute
  const rd = invoke('kindlepool-deployer', 'raise_dispute', `--pool_id ${pid}`, `--disputant ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, '--reason 0', `--evidence_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  check('S4', 'raise_dispute', 'Success', rd.includes('Success') ? 'Success' : rd)
  // Find dispute id
  let did = -1
  for (let c = 1; c <= 30; c++) {
    const d = invoke('kindlepool-deployer', 'get_dispute', `--dispute_id ${c}`)
    if (d.includes(`"pool_id":${pid}`)) { did = c; break }
  }
  check('S4', 'dispute found', '\\d+', String(did))
  invoke('kindlepool-deployer', 'resolve_dispute', `--pool_id ${pid}`, `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, `--dispute_id ${did}`, '--vote_for_creator true', `--reason_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  await pace()
  invoke('attacker', 'resolve_dispute', `--pool_id ${pid}`, '--caller GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', `--dispute_id ${did}`, '--vote_for_creator true', `--reason_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  await pace()
  invoke('sup-b', 'resolve_dispute', `--pool_id ${pid}`, '--caller GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', `--dispute_id ${did}`, '--vote_for_creator false', `--reason_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  await pace()
  const close = invoke('kindlepool-deployer', 'close_dispute', `--pool_id ${pid}`, `--dispute_id ${did}`)
  check('S4', 'close_dispute', 'Success', close.includes('Success') ? 'Success' : close)
  const p = poolState(pid)
  check('S4', 'pool paid (creator wins)', '"status":2', JSON.stringify(p))
}

async function s5_dispute_supporters_win() {
  console.log('▶ S5: Dispute — arbitrate 1-2 → supporters win')
  const pid = createPool(100000000, 300)
  invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 60000000')
  invoke('sup-b', 'deposit', `--pool_id ${pid}`, '--supporter GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', '--amount 40000000')
  await sleep(4000)
  invoke('kindlepool-deployer', 'submit_work', `--pool_id ${pid}`, `--work_hash ${'2222222222222222222222222222222222222222222222222222222222222222'}`)
  invoke('kindlepool-deployer', 'raise_dispute', `--pool_id ${pid}`, `--disputant ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, '--reason 0', `--evidence_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  let did = -1
  for (let c = 1; c <= 30; c++) {
    const d = invoke('kindlepool-deployer', 'get_dispute', `--dispute_id ${c}`)
    if (d.includes(`"pool_id":${pid}`)) { did = c; break }
  }
  // 1 for creator, 2 against
  invoke('kindlepool-deployer', 'resolve_dispute', `--pool_id ${pid}`, `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, `--dispute_id ${did}`, '--vote_for_creator true', `--reason_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  invoke('attacker', 'resolve_dispute', `--pool_id ${pid}`, '--caller GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', `--dispute_id ${did}`, '--vote_for_creator false', `--reason_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  invoke('sup-b', 'resolve_dispute', `--pool_id ${pid}`, '--caller GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', `--dispute_id ${did}`, '--vote_for_creator false', `--reason_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  const close = invoke('kindlepool-deployer', 'close_dispute', `--pool_id ${pid}`, `--dispute_id ${did}`)
  check('S5', 'close_dispute', 'Success', close.includes('Success') ? 'Success' : close)
  const p = poolState(pid)
  check('S5', 'pool expired (supporters win)', '"status":3', JSON.stringify(p))
}

async function s6_dispute_appeal() {
  console.log('▶ S6: Dispute appeal — doubled fee, re-vote, final close')
  const pid = createPool(100000000, 300)
  invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 60000000')
  invoke('sup-b', 'deposit', `--pool_id ${pid}`, '--supporter GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', '--amount 40000000')
  await sleep(4000)
  invoke('kindlepool-deployer', 'submit_work', `--pool_id ${pid}`, `--work_hash ${'2222222222222222222222222222222222222222222222222222222222222222'}`)
  invoke('kindlepool-deployer', 'raise_dispute', `--pool_id ${pid}`, `--disputant ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, '--reason 0', `--evidence_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  let did = -1
  for (let c = 1; c <= 30; c++) {
    const d = invoke('kindlepool-deployer', 'get_dispute', `--dispute_id ${c}`)
    if (d.includes(`"pool_id":${pid}`)) { did = c; break }
  }
  // First round: supporters lead 0-2 (no creator votes)
  invoke('attacker', 'resolve_dispute', `--pool_id ${pid}`, '--caller GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', `--dispute_id ${did}`, '--vote_for_creator false', `--reason_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  invoke('sup-b', 'resolve_dispute', `--pool_id ${pid}`, '--caller GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', `--dispute_id ${did}`, '--vote_for_creator false', `--reason_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  // Creator appeals (doubles fee)
  const appeal = invoke('kindlepool-deployer', 'appeal_dispute', `--pool_id ${pid}`, `--disputant ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, `--dispute_id ${did}`)
  check('S6', 'appeal (doubled fee)', 'Success', appeal.includes('Success') ? 'Success' : appeal)
  // Final round: creator gets 2 votes → 2-2 tie → supporters win (tie-break)
  invoke('kindlepool-deployer', 'resolve_dispute', `--pool_id ${pid}`, `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, `--dispute_id ${did}`, '--vote_for_creator true', `--reason_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  invoke('kindlepool-deployer', 'resolve_dispute', `--pool_id ${pid}`, `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, `--dispute_id ${did}`, '--vote_for_creator true', `--reason_hash ${'3333333333333333333333333333333333333333333333333333333333333333'}`)
  const close = invoke('kindlepool-deployer', 'close_dispute', `--pool_id ${pid}`, `--dispute_id ${did}`)
  check('S6', 'close after appeal', 'Success', close.includes('Success') ? 'Success' : close)
  const p = poolState(pid)
  check('S6', 'tie → supporters win', '"status":3', JSON.stringify(p))
  const d = invoke('kindlepool-deployer', 'get_dispute', `--dispute_id ${did}`)
  check('S6', 'appeal_count=1', '"appeal_count":1', d)
}

async function s7_referral_reward() {
  console.log('▶ S7: Referral — claim 0.5% reward after successful pool')
  // F-105: rewards are self-funded from the platform fee (cap = fee).
  invoke('kindlepool-deployer', 'set_fee', '--caller GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP', '--fee_bps 50', '--treasury GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP')
  await pace()
  const pid = createPool(100000000, 120)
  invoke('kindlepool-deployer', 'register_referral', `--referrer ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, '--referee GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', `--pool_id ${pid}`)
  invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 100000000')
  await sleep(4000)
  invoke('kindlepool-deployer', 'submit_work', `--pool_id ${pid}`, `--work_hash ${'2222222222222222222222222222222222222222222222222222222222222222'}`)
  invoke('attacker', 'vote', `--pool_id ${pid}`, '--voter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--approve true')
  await sleep(125000)
  invoke('kindlepool-deployer', 'finalize', `--pool_id ${pid}`)
  const claim = invoke('kindlepool-deployer', 'claim_referral_reward', `--referrer ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`)
  check('S7', 'claim 0.5% of 100M = 500K', '500000', claim)
}

async function s8_fee_lifecycle() {
  console.log('▶ S8: Fee lifecycle — collect + withdraw')
  const treasuryBefore = usdcBalance('GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP')
  invoke('kindlepool-deployer', 'set_fee', '--caller GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP', '--fee_bps 50', '--treasury GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP')
  await pace()
  const before = invoke('kindlepool-deployer', 'get_total_fees_collected')
  const pid = createPool(200000000, 120)
  invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 200000000')
  await sleep(4000)
  invoke('kindlepool-deployer', 'submit_work', `--pool_id ${pid}`, `--work_hash ${'2222222222222222222222222222222222222222222222222222222222222222'}`)
  invoke('attacker', 'vote', `--pool_id ${pid}`, '--voter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--approve true')
  await sleep(125000)
  invoke('kindlepool-deployer', 'finalize', `--pool_id ${pid}`)
  await sleep(6000)
  const after = invoke('kindlepool-deployer', 'get_total_fees_collected')
  // 0.5% of 200M = 1M fee
  check('S8', 'fee collected = 1M', '1000000', String(Number(after.match(/\d+/)?.[0] ?? 0) - Number(before.match(/\d+/)?.[0] ?? 0)))
  // F-401 semantics: the fee is DELIVERED to the treasury at settlement, so the
  // contract holds 0 and withdraw_fees must revert (#38 — balance guard).
  const wd = invoke('kindlepool-deployer', 'withdraw_fees', `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, '--amount 1000000', `--token ${USDC}`)
  check('S8', 'withdraw on empty contract #38', '#38', wd)
  const feeState = invoke('kindlepool-deployer', 'get_total_fees_collected')
  const feeNow = Number(feeState.match(/\d+/)?.[0] ?? 0)
  check('S8', 'FeeTotal +1M', String(Number(before) + 1000000), String(feeNow))
  const treasuryAfterFee = usdcBalance('GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP')
  // Treasury (deployer = creator) received payout 199M + fee 1M = 200M.
  check('S8', 'treasury received payout+fee', '200000000', String(treasuryAfterFee - treasuryBefore))
  // F-401 live proof: orphaned surplus in the contract IS withdrawable to treasury.
  usdcInvoke('attacker', 'transfer', `--from GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D`, `--to ${CT}`, '--amount 1000000')
  await pace()
  const wd2 = invoke('kindlepool-deployer', 'withdraw_fees', `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, '--amount 1000000', `--token ${USDC}`)
  check('S8', 'withdraw surplus transfers', 'Success', wd2.includes('Success') ? 'Success' : wd2)
  const treasuryFinal = usdcBalance('GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP')
  check('S8', 'treasury +1M after withdraw', '1000000', String(treasuryFinal - treasuryAfterFee))
  const zero = invoke('kindlepool-deployer', 'get_total_fees_collected')
  check('S8', 'FeeTotal drained', '0', String(zero.match(/\d+/)?.[0]))
}

async function s9_admin_transfer() {
  console.log('▶ S9: Admin — full transfer cycle + rejections')
  const wrong = invoke('sup-c', 'accept_admin', `--caller ${'GA4HESRPSVM7PLTCJOC5OTA2FNZIUKG5EJ5W6EAVSHEH52VNLFY7AVHA'}`)
  check('S9', 'wrong accept #33', '#33', wrong)
  const prop = invoke('kindlepool-deployer', 'propose_admin', `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, '--new_admin GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA')
  check('S9', 'propose', 'Success', prop.includes('Success') ? 'Success' : prop)
  const acc = invoke('sup-b', 'accept_admin', '--caller GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA')
  check('S9', 'accept', 'Success', acc.includes('Success') ? 'Success' : acc)
  const g = invoke('kindlepool-deployer', 'get_admin')
  check('S9', 'admin transferred', 'GCIRZQ64', g)
  // Transfer back
  invoke('sup-b', 'propose_admin', '--caller GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', `--new_admin ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`)
  invoke('kindlepool-deployer', 'accept_admin', `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`)
}

async function s10_pause_cycle() {
  console.log('▶ S10: Pause full cycle (compressed 60s timelocks)')
  // Fresh contracts carry mainnet defaults; compress for the live window.
  invoke('kindlepool-deployer', 'set_flow_constants', '--caller GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP', '--vote_deadline_seconds 120', '--pause_notice_seconds 60', '--unpause_cooldown_seconds 60')
  await pace()
  const pid = createPool(50000000, 300)
  const sched = invoke('kindlepool-deployer', 'schedule_pause', `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`)
  check('S10', 'schedule', 'Success', sched.includes('Success') ? 'Success' : sched)
  const early = invoke('kindlepool-deployer', 'pause', `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`)
  check('S10', 'early pause #35', '#35', early)
  await sleep(65000)
  const pause = invoke('kindlepool-deployer', 'pause', `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`)
  check('S10', 'pause after notice', 'Success', pause.includes('Success') ? 'Success' : pause)
  const blocked = invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 10000000')
  check('S10', 'deposit blocked #34', '#34', blocked)
  const earlyUn = invoke('kindlepool-deployer', 'unpause', `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`)
  check('S10', 'early unpause #36', '#36', earlyUn)
  await sleep(65000)
  const unp = invoke('kindlepool-deployer', 'unpause', `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`)
  check('S10', 'unpause after cooldown', 'Success', unp.includes('Success') ? 'Success' : unp)
  const resume = invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 10000000')
  check('S10', 'deposit resumes', 'Success', resume.includes('Success') ? 'Success' : resume)
}

async function s11_cancel() {
  console.log('▶ S11: cancel_pool → refunds')
  const pid = createPool(50000000, 300)
  const aBefore = usdcBalance('GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D')
  invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 20000000')
  await sleep(4000)
  const out = invoke('kindlepool-deployer', 'cancel_pool', `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, `--pool_id ${pid}`)
  check('S11', 'cancel', 'Success', out.includes('Success') ? 'Success' : out)
  const p = poolState(pid)
  check('S11', 'status expired', '"status":3', JSON.stringify(p))
  await sleep(4000)
  const aAfter = usdcBalance('GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D')
  // Deposit (-20M) + refund (+20M) nets to zero — proves exact refund
  check('S11', 'refund restores balance (net 0)', '^0$', String(aAfter - aBefore))
}

async function s12_negative_matrix() {
  console.log('▶ S12: Negative matrix')
  const pid = createPool(100000000, 300)
  const zero = invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 0')
  check('S12', 'zero deposit #3', '#3', zero)
  await pace()
  invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 60000000')
  invoke('sup-b', 'deposit', `--pool_id ${pid}`, '--supporter GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', '--amount 40000000')
  await sleep(4000)
  invoke('kindlepool-deployer', 'submit_work', `--pool_id ${pid}`, `--work_hash ${'2222222222222222222222222222222222222222222222222222222222222222'}`)
  const nonMember = invoke('kindlepool-deployer', 'vote', `--pool_id ${pid}`, `--voter ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, '--approve true')
  check('S12', 'non-member vote #8', '#8', nonMember)
  const double = invoke('kindlepool-deployer', 'submit_work', `--pool_id ${pid}`, `--work_hash ${'2222222222222222222222222222222222222222222222222222222222222222'}`)
  check('S12', 'double submit #5', '#5', double)
  invoke('attacker', 'vote', `--pool_id ${pid}`, '--voter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--approve true')
  const dblVote = invoke('attacker', 'vote', `--pool_id ${pid}`, '--voter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--approve false')
  check('S12', 'double vote #9', '#9', dblVote)
}

async function s13_randomized_sequences() {
  console.log('▶ S13: Randomized live sequences (invariant audit)')
  const rng = (n: number) => Math.floor(Math.random() * n)
  let poolsChecked = 0
  for (let i = 0; i < 3; i++) {
    const pid = createPool(100000000, 600)
    const steps = 3 + rng(4)
    for (let s = 0; s < steps; s++) {
      const who = [ATT, SUPB, SUPC][rng(3)]
      const amt = (rng(4) + 1) * 10000000
      invoke(who === ATT ? 'attacker' : who === SUPB ? 'sup-b' : 'sup-c', 'deposit', `--pool_id ${pid}`, `--supporter ${who}`, `--amount ${amt}`)
    }
    await sleep(4000)
    const p = poolState(pid)
    // Invariant: votes ≤ deposits, status legal
    if (Number(p.yes_votes ?? 0) + Number(p.no_votes ?? 0) <= Number(p.total_deposited ?? 0) && Number(p.status ?? 0) <= 5) {
      poolsChecked++
    }
  }
  check('S13', '3 random pools invariant-clean', '3', String(poolsChecked))
}

async function s14_idempotency() {
  console.log('▶ S14: Idempotency — replay finalize/cancel/close')
  const pid = createPool(50000000, 90)
  invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 10000000')
  await sleep(95000)
  invoke('kindlepool-deployer', 'finalize', `--pool_id ${pid}`)
  const replay = invoke('kindlepool-deployer', 'finalize', `--pool_id ${pid}`)
  check('S14', 'double finalize #14', '#14', replay)
  const cancel = invoke('kindlepool-deployer', 'cancel_pool', `--caller ${'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'}`, `--pool_id ${pid}`)
  check('S14', 'cancel expired pool #5', '#5', cancel)
}

async function s15_concurrent_accounts() {
  console.log('▶ S15: Concurrent accounts — interleaved ops')
  const pid = createPool(200000000, 300)
  // Interleave deposits from 3 accounts without waits
  invoke('attacker', 'deposit', `--pool_id ${pid}`, '--supporter GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D', '--amount 70000000')
  await pace()
  invoke('sup-b', 'deposit', `--pool_id ${pid}`, '--supporter GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA', '--amount 70000000')
  await pace()
  invoke('sup-c', 'deposit', `--pool_id ${pid}`, '--supporter GA4HESRPSVM7PLTCJOC5OTA2FNZIUKG5EJ5W6EAVSHEH52VNLFY7AVHA', '--amount 60000000')
  await sleep(6000)
  const p = poolState(pid)
  check('S15', 'all deposits landed (200M)', '"total_deposited":"200000000"', JSON.stringify(p))
  check('S15', '3 supporters', '"total_supporters":3', JSON.stringify(p))
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log(`Contract: ${CT} | Network: ${NET}`)
  const suites: [string, () => Promise<void>][] = [
    ['S1', s1_happy_path_approve_payout],
    ['S2', s2_reject_refund],
    ['S3', s3_expiry_refund],
    ['S4', s4_dispute_creator_wins],
    ['S5', s5_dispute_supporters_win],
    ['S6', s6_dispute_appeal],
    ['S7', s7_referral_reward],
    ['S8', s8_fee_lifecycle],
    ['S9', s9_admin_transfer],
    ['S10', s10_pause_cycle],
    ['S11', s11_cancel],
    ['S12', s12_negative_matrix],
    ['S13', s13_randomized_sequences],
    ['S14', s14_idempotency],
    ['S15', s15_concurrent_accounts],
  ]
  const filter = process.env.SUITES
  const selected = filter ? suites.filter(([name]) => filter.split(',').includes(name)) : suites
  for (const [name, fn] of selected) {
    try { await fn() } catch (e: any) { console.log(`  ❌ SUITE ${name} ERROR: ${e.message}`) }
    console.log('')
  }
  const pass = results.filter((r) => r.status === 'PASS').length
  const fail = results.length - pass
  console.log(`═══ RESULTS (${selected.length} suites): ${pass} PASS / ${fail} FAIL / ${results.length} CHECKS ═══`)
  if (fail > 0) process.exit(1)
}

main()
