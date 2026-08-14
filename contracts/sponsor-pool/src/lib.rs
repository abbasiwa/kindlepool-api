#![no_std]
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Vec};

mod math;
mod pool;
mod types;

#[cfg(test)]
mod test;

#[cfg(test)]
mod proptest;

#[contract]
pub struct SponsorPool;

#[contractimpl]
impl SponsorPool {
    pub fn initialize(env: Env, caller: Address, admin: Address) {
        caller.require_auth();
        pool::init_admin(&env, &admin);
    }

    pub fn create(
        env: Env,
        creator: Address,
        goal: i128,
        deadline: u64,
        token: Address,
        metadata_hash: BytesN<32>,
    ) -> u32 {
        pool::create(&env, &creator, goal, deadline, &token, &metadata_hash)
    }

    pub fn deposit(env: Env, pool_id: u32, supporter: Address, amount: i128) {
        pool::deposit(&env, pool_id, &supporter, amount);
    }

    pub fn submit_work(env: Env, pool_id: u32, work_hash: BytesN<32>) {
        pool::submit_work(&env, pool_id, &work_hash);
    }

    pub fn vote(env: Env, pool_id: u32, voter: Address, approve: bool) {
        pool::vote(&env, pool_id, &voter, approve);
    }

    pub fn finalize(env: Env, pool_id: u32) {
        pool::finalize(&env, pool_id);
    }

    pub fn claim_refund(env: Env, supporter: Address, pool_id: u32) -> i128 {
        pool::claim_refund(&env, &supporter, pool_id)
    }

    pub fn cancel_pool(env: Env, caller: Address, pool_id: u32) {
        pool::cancel_pool(&env, &caller, pool_id);
    }

    pub fn raise_dispute(
        env: Env,
        pool_id: u32,
        disputant: Address,
        reason: u32,
        evidence_hash: BytesN<32>,
    ) {
        pool::raise_dispute(&env, pool_id, &disputant, reason, &evidence_hash);
    }

    pub fn resolve_dispute(
        env: Env,
        pool_id: u32,
        caller: Address,
        dispute_id: u32,
        vote_for_creator: bool,
        reason_hash: BytesN<32>,
    ) {
        pool::resolve_dispute(&env, pool_id, &caller, dispute_id, vote_for_creator, &reason_hash);
    }

    pub fn close_dispute(env: Env, pool_id: u32, dispute_id: u32) {
        pool::close_dispute(&env, pool_id, dispute_id);
    }

    pub fn appeal_dispute(env: Env, pool_id: u32, disputant: Address, dispute_id: u32) {
        pool::appeal_dispute(&env, pool_id, &disputant, dispute_id);
    }

    // ─── Admin & Security ───────────────────────────────────────

    pub fn get_admin(env: Env) -> Address {
        pool::get_admin(&env)
    }

    pub fn propose_admin(env: Env, caller: Address, new_admin: Address) {
        pool::propose_admin(&env, &caller, &new_admin);
    }

    pub fn accept_admin(env: Env, caller: Address) {
        pool::accept_admin(&env, &caller);
    }

    pub fn schedule_pause(env: Env, caller: Address) {
        pool::schedule_pause(&env, &caller);
    }

    pub fn pause(env: Env, caller: Address) {
        pool::pause(&env, &caller);
    }

    pub fn unpause(env: Env, caller: Address) {
        pool::unpause(&env, &caller);
    }

    pub fn get_paused(env: Env) -> bool {
        pool::get_paused(&env)
    }

    // ─── Fees & Treasury ────────────────────────────────────────

    pub fn set_fee(env: Env, caller: Address, fee_bps: u32, treasury: Address) {
        pool::set_fee(&env, &caller, fee_bps, &treasury);
    }

    pub fn set_fee_treasury(env: Env, caller: Address, treasury: Address) {
        pool::set_fee_treasury(&env, &caller, &treasury);
    }

    pub fn withdraw_fees(env: Env, caller: Address, amount: i128, token: Address) {
        pool::withdraw_fees(&env, &caller, amount, &token);
    }

    pub fn get_fee(env: Env) -> (i128, Option<Address>) {
        pool::get_fee(&env)
    }

    pub fn get_total_fees_collected(env: Env) -> i128 {
        pool::get_total_fees_collected(&env)
    }

    // ─── Referrals ──────────────────────────────────────────────

    pub fn register_referral(env: Env, referrer: Address, referee: Address, pool_id: u32) {
        pool::register_referral(&env, &referrer, &referee, pool_id);
    }

    pub fn claim_referral_reward(env: Env, referrer: Address) -> i128 {
        pool::claim_referral_reward(&env, &referrer)
    }

    pub fn get_referrals(env: Env, referrer: Address) -> Vec<types::Referral> {
        pool::get_referrals(&env, &referrer)
    }

    // ─── View Functions ─────────────────────────────────────────

    pub fn get_dispute(env: Env, dispute_id: u32) -> Option<types::Dispute> {
        pool::get_dispute(&env, dispute_id)
    }

    pub fn get_arbitrator_votes(env: Env, dispute_id: u32) -> Vec<types::ArbitratorVote> {
        pool::get_arbitrator_votes(&env, dispute_id)
    }

    pub fn get_pool(env: Env, pool_id: u32) -> Option<types::Pool> {
        pool::get_pool(&env, pool_id)
    }

    pub fn get_pool_count(env: Env) -> u32 {
        pool::get_pool_count(&env)
    }

    pub fn get_supporter(env: Env, pool_id: u32, address: Address) -> Option<types::Supporter> {
        pool::get_supporter(&env, pool_id, &address)
    }

    pub fn get_pools_by_creator(env: Env, creator: Address) -> Vec<u32> {
        pool::get_pools_by_creator(&env, &creator)
    }

    pub fn get_pools_by_supporter(env: Env, supporter: Address) -> Vec<u32> {
        pool::get_pools_by_supporter(&env, &supporter)
    }

    pub fn get_platform_stats(env: Env) -> types::PlatformStats {
        pool::get_platform_stats(&env)
    }

    pub fn get_contract_version(env: Env) -> u32 {
        pool::get_contract_version(&env)
    }

    pub fn set_flow_constants(
        env: Env,
        caller: Address,
        vote_deadline_seconds: u64,
        pause_notice_seconds: u64,
        unpause_cooldown_seconds: u64,
    ) {
        pool::set_flow_constants(&env, &caller, vote_deadline_seconds, pause_notice_seconds, unpause_cooldown_seconds);
    }

    pub fn get_flow_constants(env: Env) -> (u64, u64, u64) {
        pool::get_flow_constants(&env)
    }
}
