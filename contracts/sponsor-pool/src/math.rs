//! Pure settlement math for the sponsor-pool contract.
//!
//! Extracted so fuzz targets and property tests can exercise the exact
//! arithmetic used on-chain without a Soroban Env.

/// Settles a payout with a platform fee.
/// fee = floor(total * fee_bps / 10000); payout = total - fee.
/// Returns (payout, fee).
///
/// # Panics
/// Panics if `total < 0` or `fee_bps > 500` (preconditions the contract
/// enforces before calling this).
pub fn settle_fee(total_deposited: i128, fee_bps: u32) -> (i128, i128) {
    assert!(total_deposited >= 0, "total_deposited must be non-negative");
    assert!(fee_bps <= 500, "fee_bps must be <= 500");
    let fee = if fee_bps > 0 {
        (total_deposited * fee_bps as i128) / 10000i128
    } else {
        0
    };
    let payout = total_deposited - fee;
    (payout, fee)
}

/// Tallies token-weighted votes.
/// Each entry is (amount, approve). Returns (yes, no).
/// Invariant: yes + no == sum(amounts).
pub fn tally_votes(entries: &[(i128, bool)]) -> (i128, i128) {
    let mut yes: i128 = 0;
    let mut no: i128 = 0;
    for (amount, approve) in entries {
        let amount = *amount;
        assert!(amount >= 0, "amount must be non-negative");
        if *approve {
            yes += amount;
        } else {
            no += amount;
        }
    }
    (yes, no)
}

/// Computes total pro-rata refund for a supporter list.
/// Invariant: sum(refunds) == sum(amounts) == pool balance at settlement.
pub fn pro_rata_refund(supporter_amounts: &[i128], pool_balance: i128) -> i128 {
    let mut refunded: i128 = 0;
    for amount in supporter_amounts {
        let amount = *amount;
        assert!(amount >= 0, "amount must be non-negative");
        if amount > 0 {
            refunded += amount;
        }
    }
    assert!(
        refunded <= pool_balance,
        "refunds cannot exceed contract balance"
    );
    refunded
}

/// Computes a referral reward for one contribution.
/// Reward = floor(contribution * bps / 10000); capped by bps.
pub fn referral_reward(contribution: i128, bps: i128) -> i128 {
    assert!(contribution >= 0, "contribution must be non-negative");
    assert!(bps >= 0, "bps must be non-negative");
    (contribution * bps) / 10000i128
}

/// Computes the dispute fee (1% of goal, DISPUTE_FEE_BPS = 100).
pub fn dispute_fee(goal: i128) -> i128 {
    assert!(goal >= 0, "goal must be non-negative");
    (goal * 100) / 10000i128
}

/// Whether the creator wins a dispute under strict majority.
/// Ties and zero-vote disputes resolve in favor of supporters.
pub fn creator_wins_dispute(votes_for_creator: i128, votes_against_creator: i128) -> bool {
    votes_for_creator > votes_against_creator
}
