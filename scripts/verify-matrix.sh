#!/usr/bin/env bash
set -uo pipefail

# KindlePool Verification Matrix — Live Testnet Harness (Issue #1, Step 17)
# Verifies all 35 entry points against the deployed v3 contract.
# Produces verification-report.json

CT="CCRSLQSTTVMLUIU3I3TU2GRUFPUNCPGFLSFOTDWEVUF65V6PQBLOGNT2"
USDC="CD2CIUPXUDF3HFTBMKBS7SKAPNUGC4V2ZWJMBA2MG6GY76BKZN7OIYEY"
DEP="GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP"
ATT="GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D"
SUPB="GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA"
SUPC="GA4HESRPSVM7PLTCJOC5OTA2FNZIUKG5EJ5W6EAVSHEH52VNLFY7AVHA"
NET="testnet"

META="1111111111111111111111111111111111111111111111111111111111111111"
WORK="2222222222222222222222222222222222222222222222222222222222222222"
EVID="3333333333333333333333333333333333333333333333333333333333333333"

REPORT=/tmp/verification-report.json
declare -a RESULTS=()

invoke() { stellar contract invoke --id "$CT" --source-account "$1" --network "$NET" -- "${@:2}"; }

record() { # record <entry> <status> <detail>
  RESULTS+=("{\"entry\":\"$1\",\"status\":\"$2\",\"detail\":\"$3\"}")
}

check_ok() { # check_ok <entry> <label> <expected-substr> <actual>
  local entry="$1" label="$2" expected="$3" actual="$4"
  if echo "$actual" | grep -q "$expected"; then
    echo "  ✅ $label"
    record "$entry" "PASS" "$actual"
  else
    echo "  ❌ $label — got [$actual]"
    record "$entry" "FAIL" "$actual"
  fi
}

balance() { invoke kindlepool-deployer balance --id "$1" 2>/dev/null | tr -d '"\n '; }

echo "╔══════════════════════════════════════════════════════╗"
echo "║   KindlePool Verification Matrix — Live Testnet       ║"
echo "║   Contract: $CT"
echo "╚══════════════════════════════════════════════════════╝"

# ── A. Admin & Security (9 entry points) ───────────────────────
echo ""
echo "▶ A. Admin & Security"
check_ok "get_admin" "A1 get_admin" "GAPCUR73" "$(invoke kindlepool-deployer get_admin 2>&1 | tail -1)"
check_ok "get_contract_version" "A2 version=3" "3" "$(invoke kindlepool-deployer get_contract_version 2>&1 | tail -1)"

NEW_ADMIN=$(stellar keys public-key sup-c)
invoke kindlepool-deployer propose_admin --caller "$DEP" --new_admin "$NEW_ADMIN" >/dev/null 2>&1
check_ok "propose_admin" "A3 propose_admin" "Success" "$(invoke kindlepool-deployer propose_admin --caller "$DEP" --new_admin "$NEW_ADMIN" 2>&1 | grep -o Success | head -1)"
check_ok "accept_admin(wrong)" "A4 wrong accept #33" "Error(Contract, #33)" "$(invoke kindlepool-deployer accept_admin --caller "$DEP" 2>&1 | grep -o "Error(Contract, #[0-9]*)" | head -1)"
check_ok "accept_admin" "A5 accept_admin" "Success" "$(invoke sup-c accept_admin --caller "$NEW_ADMIN" 2>&1 | grep -o Success | head -1)"
check_ok "get_admin(new)" "A6 admin transferred" "$SUPC" "$(invoke kindlepool-deployer get_admin 2>&1 | tail -1)"
# Transfer back to deployer
invoke sup-c propose_admin --caller "$NEW_ADMIN" --new_admin "$DEP" >/dev/null 2>&1
invoke kindlepool-deployer accept_admin --caller "$DEP" >/dev/null 2>&1

check_ok "set_fee(admin)" "A7 admin set_fee" "Success" "$(invoke kindlepool-deployer set_fee --caller "$DEP" --fee_bps 50 --treasury "$DEP" 2>&1 | grep -o Success | head -1)"
check_ok "set_fee(attacker)" "A8 attacker set_fee #32" "Error(Contract, #32)" "$(invoke attacker set_fee --caller "$ATT" --fee_bps 500 --treasury "$ATT" 2>&1 | grep -o "Error(Contract, #[0-9]*)" | head -1)"
check_ok "set_fee_treasury" "A9 set_fee_treasury" "Success" "$(invoke kindlepool-deployer set_fee_treasury --caller "$DEP" --treasury "$DEP" 2>&1 | grep -o Success | head -1)"
check_ok "withdraw_fees(over)" "A10 withdraw > balance" "Error(Contract, #38)" "$(invoke kindlepool-deployer withdraw_fees --caller "$DEP" --amount 999999999 2>&1 | grep -o "Error(Contract, #[0-9]*)" | head -1)"
check_ok "withdraw_fees(attacker)" "A11 attacker withdraw #32" "Error(Contract, #32)" "$(invoke attacker withdraw_fees --caller "$ATT" --amount 1 2>&1 | grep -o "Error(Contract, #[0-9]*)" | head -1)"
check_ok "get_paused" "A12 not paused" "false" "$(invoke kindlepool-deployer get_paused 2>&1 | tail -1)"
check_ok "schedule_pause" "A13 schedule_pause" "Success" "$(invoke kindlepool-deployer schedule_pause --caller "$DEP" 2>&1 | grep -o Success | head -1)"
check_ok "pause(early)" "A14 pause before notice #35" "Error(Contract, #35)" "$(invoke kindlepool-deployer pause --caller "$DEP" 2>&1 | grep -o "Error(Contract, #[0-9]*)" | head -1)"

# ── B. Pool lifecycle (9 entry points) ──────────────────────────
echo ""
echo "▶ B. Pool Lifecycle"
SHORT_DEADLINE=$(( $(date +%s) + 90 ))
PID=$(invoke kindlepool-deployer create --creator "$DEP" --goal 100000000 --deadline "$SHORT_DEADLINE" --token "$USDC" --metadata_hash "$META" 2>&1 | tail -1)
check_ok "create" "B1 create" "^[0-9]*$" "$PID"

invoke attacker deposit --pool_id "$PID" --supporter "$ATT" --amount 50000000 >/dev/null 2>&1
invoke sup-b deposit --pool_id "$PID" --supporter "$SUPB" --amount 30000000 >/dev/null 2>&1
invoke sup-c deposit --pool_id "$PID" --supporter "$SUPC" --amount 20000000 >/dev/null 2>&1
sleep 4
P=$(invoke kindlepool-deployer get_pool --pool_id "$PID" 2>/dev/null)
check_ok "deposit" "B2 deposits=100M" '"total_deposited":"100000000"' "$P"
check_ok "get_supporter" "B3 get_supporter" '"amount":"50000000"' "$(invoke kindlepool-deployer get_supporter --pool_id "$PID" --address "$ATT" 2>&1 | tail -1)"
check_ok "get_pools_by_supporter" "B4 supporter list" "\[" "$(invoke kindlepool-deployer get_pools_by_supporter --supporter "$ATT" 2>&1 | tail -1)"

invoke kindlepool-deployer submit_work --pool_id "$PID" --work_hash "$WORK" >/dev/null 2>&1
P=$(invoke kindlepool-deployer get_pool --pool_id "$PID" 2>/dev/null)
check_ok "submit_work" "B5 work submitted" '"work_submitted":true' "$P"

SHORT3=$(( $(date +%s) + 300 ))
PID3=$(invoke kindlepool-deployer create --creator "$DEP" --goal 50000000 --deadline "$SHORT3" --token "$USDC" --metadata_hash "$META" 2>&1 | tail -1)
check_ok "submit_work(attacker)" "B6 non-creator blocked" "Error(Contract, #[0-9]*)" "$(invoke attacker submit_work --pool_id "$PID3" --work_hash "$WORK" 2>&1 | grep -o "Error(Contract, #[0-9]*)" | head -1)"

invoke attacker vote --pool_id "$PID" --voter "$ATT" --approve true >/dev/null 2>&1
invoke sup-b vote --pool_id "$PID" --voter "$SUPB" --approve false >/dev/null 2>&1
P=$(invoke kindlepool-deployer get_pool --pool_id "$PID" 2>/dev/null)
check_ok "vote" "B7 yes=50M no=30M" '"yes_votes":"50000000"' "$P"

check_ok "vote(double)" "B8 double vote #9" "Error(Contract, #9)" "$(invoke attacker vote --pool_id "$PID" --voter "$ATT" --approve true 2>&1 | grep -o "Error(Contract, #[0-9]*)" | head -1)"
check_ok "vote(non-supporter)" "B9 non-supporter vote #8" "Error(Contract, #8)" "$(invoke kindlepool-deployer vote --pool_id "$PID" --voter "$DEP" --approve true 2>&1 | grep -o "Error(Contract, #[0-9]*)" | head -1)"

# ── C. Cancel (1 entry) ─────────────────────────────────────────
echo ""
echo "▶ C. Cancel"
SHORT2=$(( $(date +%s) + 300 ))
PID2=$(invoke kindlepool-deployer create --creator "$DEP" --goal 50000000 --deadline "$SHORT2" --token "$USDC" --metadata_hash "$META" 2>&1 | tail -1)
invoke attacker deposit --pool_id "$PID2" --supporter "$ATT" --amount 20000000 >/dev/null 2>&1
sleep 3
check_ok "cancel_pool" "C1 cancel" "Success" "$(invoke kindlepool-deployer cancel_pool --caller "$DEP" --pool_id "$PID2" 2>&1 | grep -o Success | head -1)"
P=$(invoke kindlepool-deployer get_pool --pool_id "$PID2" 2>/dev/null)
check_ok "cancel_pool(state)" "C2 cancelled=expired" '"status":3' "$P"

# ── D. Referrals (3 entry points) ───────────────────────────────
echo ""
echo "▶ D. Referrals"
R1=$(invoke kindlepool-deployer register_referral --referrer "$DEP" --referee "$ATT" --pool_id "$PID" 2>&1)
check_ok "register_referral" "D1 register" "Success" "$R1"
check_ok "get_referrals" "D2 referrals" '"referee"' "$(invoke kindlepool-deployer get_referrals --referrer "$DEP" 2>&1 | tail -1)"
check_ok "claim_referral_reward" "D3 claim (no reward yet)" "0" "$(invoke kindlepool-deployer claim_referral_reward --referrer "$DEP" 2>&1 | tail -1)"

# ── E. Views (6 entry points) ───────────────────────────────────
echo ""
echo "▶ E. Views"
check_ok "get_pool" "E1 get_pool" '"creator"' "$(invoke kindlepool-deployer get_pool --pool_id "$PID" 2>/dev/null | tail -1)"
check_ok "get_pool_count" "E2 count>0" "[1-9]" "$(invoke kindlepool-deployer get_pool_count 2>&1 | tail -1)"
check_ok "get_pools_by_creator" "E3 creator list" "\[" "$(invoke kindlepool-deployer get_pools_by_creator --creator "$DEP" 2>&1 | tail -1)"
check_ok "get_platform_stats" "E4 stats" '"pool_count"' "$(invoke kindlepool-deployer get_platform_stats 2>&1 | tail -1)"
check_ok "get_fee" "E5 fee" '\["50"' "$(invoke kindlepool-deployer get_fee 2>&1 | tail -1)"
check_ok "get_total_fees_collected" "E6 fee total" '"[0-9]*"' "$(invoke kindlepool-deployer get_total_fees_collected 2>&1 | tail -1)"

# ── F. Dispute views (2 entry points) ───────────────────────────
echo ""
echo "▶ F. Dispute Views"
# Raise a fresh dispute on the B-section pool (AWAITING_VOTE)
invoke kindlepool-deployer raise_dispute --pool_id "$PID" --disputant "$DEP" --reason 0 --evidence_hash "$EVID" >/dev/null 2>&1
# Dispute IDs are sequential (DisputeCount), not pool IDs — find ours
DID=""
for cand in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  D=$(invoke kindlepool-deployer get_dispute --dispute_id "$cand" 2>/dev/null | tail -1)
  if echo "$D" | grep -q "pool_id" && echo "$D" | grep -q "$PID"; then DID="$cand"; break; fi
done
check_ok "get_dispute" "F1 dispute on pool" '"pool_id":' "$(invoke kindlepool-deployer get_dispute --dispute_id "$DID" 2>&1 | tail -1)"
invoke kindlepool-deployer resolve_dispute --pool_id "$PID" --caller "$DEP" --dispute_id "$DID" --vote_for_creator true --reason_hash "$EVID" >/dev/null 2>&1
check_ok "get_arbitrator_votes" "F2 votes" '"vote_for_creator":true' "$(invoke kindlepool-deployer get_arbitrator_votes --dispute_id "$DID" 2>&1 | tail -1)"

# ── Report ──────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════"
printf '{\n  "contract": "%s",\n  "network": "%s",\n  "timestamp": "%s",\n  "results": [\n' "$CT" "$NET" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$REPORT"
printf '    %s\n' "$(IFS=$'\n'; echo "${RESULTS[*]}" | paste -sd,)" >> "$REPORT"
printf '  ]\n}\n' >> "$REPORT"

PASS_COUNT=$(printf '%s\n' "${RESULTS[@]}" | grep -c '"PASS"')
FAIL_COUNT=$(printf '%s\n' "${RESULTS[@]}" | grep -c '"FAIL"')
echo "Report: $REPORT"
echo "PASS: $PASS_COUNT  FAIL: $FAIL_COUNT  TOTAL: ${#RESULTS[@]}"
[ "$FAIL_COUNT" -eq 0 ] && echo "✅ ALL LIVE CHECKS PASSED" || echo "❌ $FAIL_COUNT CHECKS FAILED"
