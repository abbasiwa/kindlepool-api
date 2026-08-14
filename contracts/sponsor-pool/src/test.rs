#![cfg(test)]

use soroban_sdk::{testutils::Address as _, testutils::Events as _, testutils::Ledger as _, token, Address, BytesN, Env, TryFromVal};

use crate::{SponsorPool, SponsorPoolClient};

#[allow(deprecated)]
fn create_token(env: &Env, admin: &Address) -> Address {
    let contract_id = env.register_stellar_asset_contract(admin.clone());
    contract_id
}

fn mint_tokens(env: &Env, token_id: &Address, to: &Address, amount: i128) {
    let token_client = token::StellarAssetClient::new(env, token_id);
    token_client.mint(to, &amount);
}

fn setup_pool() -> (Env, Address, Address, Address, u32) {
    let env = Env::default();
    env.mock_all_auths();

    let creator = Address::generate(&env);
    let supporter = Address::generate(&env);
    let admin = Address::generate(&env);

    let token = create_token(&env, &admin);
    mint_tokens(&env, &token, &creator, 1_000_000_000);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);

    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);

    let goal = 100_000_000i128;
    let deadline = env.ledger().timestamp() + 86400;
    let metadata_hash = BytesN::from_array(&env, &[0x01u8; 32]);

    let pool_id = client.create(&creator, &goal, &deadline, &token, &metadata_hash);

    (env, contract_id, creator, supporter, pool_id)
}

#[test]
fn test_create_pool() {
    let env = Env::default();
    env.mock_all_auths();

    let creator = Address::generate(&env);
    let admin = Address::generate(&env);
    let token = create_token(&env, &admin);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);

    let goal = 100_000_000i128;
    let deadline = env.ledger().timestamp() + 86400;
    let metadata_hash = BytesN::from_array(&env, &[0x01u8; 32]);

    let pool_id = client.create(&creator, &goal, &deadline, &token, &metadata_hash);
    assert_eq!(pool_id, 1);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.creator, creator);
    assert_eq!(pool.token, token);
    assert_eq!(pool.goal, goal);
    assert_eq!(pool.deadline, deadline);
    assert_eq!(pool.status, 0);
    assert_eq!(pool.total_deposited, 0);
    assert_eq!(pool.total_supporters, 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_create_pool_zero_goal() {
    let env = Env::default();
    env.mock_all_auths();
    let creator = Address::generate(&env);
    let admin = Address::generate(&env);
    let token = create_token(&env, &admin);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    let deadline = env.ledger().timestamp() + 86400;
    let metadata_hash = BytesN::from_array(&env, &[0x01u8; 32]);
    client.create(&creator, &0, &deadline, &token, &metadata_hash);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_create_pool_past_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    let creator = Address::generate(&env);
    let admin = Address::generate(&env);
    let token = create_token(&env, &admin);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    env.ledger().set_timestamp(1_000_000);
    let deadline = env.ledger().timestamp() - 1;
    let metadata_hash = BytesN::from_array(&env, &[0x01u8; 32]);
    client.create(&creator, &100_000_000, &deadline, &token, &metadata_hash);
}

#[test]
fn test_deposit() {
    let (env, _contract_id, _creator, supporter, pool_id) = setup_pool();
    let client = SponsorPoolClient::new(&env, &_contract_id);

    let deposit_amount = 50_000_000i128;
    client.deposit(&pool_id, &supporter, &deposit_amount);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.total_deposited, deposit_amount);
    assert_eq!(pool.total_supporters, 1);

    // Deposit again
    client.deposit(&pool_id, &supporter, &25_000_000);
    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.total_deposited, 75_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_deposit_after_deadline() {
    let env = Env::default();
    env.mock_all_auths();
    let creator = Address::generate(&env);
    let supporter = Address::generate(&env);
    let admin = Address::generate(&env);
    let token = create_token(&env, &admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    let goal = 100_000_000i128;
    env.ledger().set_timestamp(1_000_000);
    let deadline = env.ledger().timestamp() + 1;
    let metadata_hash = BytesN::from_array(&env, &[0x01u8; 32]);
    let pool_id = client.create(&creator, &goal, &deadline, &token, &metadata_hash);
    env.ledger().set_timestamp(env.ledger().timestamp() + 2);
    client.deposit(&pool_id, &supporter, &50_000_000);
}

#[test]
fn test_full_lifecycle_approved() {
    let (env, _contract_id, creator, supporter, pool_id) = setup_pool();
    let client = SponsorPoolClient::new(&env, &_contract_id);
    let token = client.get_pool(&pool_id).unwrap().token;

    // Deposit enough to meet goal
    client.deposit(&pool_id, &supporter, &100_000_000);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.total_deposited, 100_000_000);

    // Creator submits work
    let work_hash = BytesN::from_array(&env, &[0x02u8; 32]);
    client.submit_work(&pool_id, &work_hash);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.status, 1); // AWAITING_VOTE
    assert!(pool.work_submitted);
    assert!(pool.vote_deadline > env.ledger().timestamp());

    // Supporter votes approve
    client.vote(&pool_id, &supporter, &true);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.yes_votes, 100_000_000);
    assert_eq!(pool.no_votes, 0);

    // Advance past vote deadline
    env.ledger().set_timestamp(pool.vote_deadline + 1);

    // Check creator balance before finalize
    let token_client = token::Client::new(&env, &token);
    let creator_balance_before = token_client.balance(&creator);

    // Finalize
    client.finalize(&pool_id);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.status, 2); // PAID

    // Creator received funds
    let creator_balance_after = token_client.balance(&creator);
    assert_eq!(creator_balance_after - creator_balance_before, 100_000_000);
}

#[test]
fn test_full_lifecycle_rejected() {
    let (env, _contract_id, _creator, supporter, pool_id) = setup_pool();
    let client = SponsorPoolClient::new(&env, &_contract_id);

    // Deposit
    client.deposit(&pool_id, &supporter, &100_000_000);

    // Creator submits work
    let work_hash = BytesN::from_array(&env, &[0x02u8; 32]);
    client.submit_work(&pool_id, &work_hash);

    // Supporter votes reject
    client.vote(&pool_id, &supporter, &false);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.yes_votes, 0);
    assert_eq!(pool.no_votes, 100_000_000);

    // Check supporter balance before finalize
    let token = pool.token;
    let token_client = token::Client::new(&env, &token);
    let supporter_balance_before = token_client.balance(&supporter);

    // Advance past vote deadline and finalize
    env.ledger().set_timestamp(pool.vote_deadline + 1);
    client.finalize(&pool_id);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.status, 3); // EXPIRED

    // Supporter got refunded
    let supporter_balance_after = token_client.balance(&supporter);
    assert!(supporter_balance_after >= supporter_balance_before + 100_000_000);
}

#[test]
fn test_expired_goal_not_met() {
    let (env, _contract_id, _creator, supporter, pool_id) = setup_pool();
    let client = SponsorPoolClient::new(&env, &_contract_id);
    let pool = client.get_pool(&pool_id).unwrap();
    let token = pool.token;

    // Deposit less than goal
    client.deposit(&pool_id, &supporter, &30_000_000);

    let token_client = token::Client::new(&env, &token);
    let supporter_balance_before = token_client.balance(&supporter);

    // Advance past pool deadline
    env.ledger().set_timestamp(pool.deadline + 1);
    client.finalize(&pool_id);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.status, 3); // EXPIRED

    let supporter_balance_after = token_client.balance(&supporter);
    assert!(supporter_balance_after >= supporter_balance_before + 30_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn test_double_finalize_panics() {
    let (env, _contract_id, _creator, supporter, pool_id) = setup_pool();
    let client = SponsorPoolClient::new(&env, &_contract_id);
    let pool = client.get_pool(&pool_id).unwrap();

    client.deposit(&pool_id, &supporter, &30_000_000);
    env.ledger().set_timestamp(pool.deadline + 1);
    client.finalize(&pool_id);
    client.finalize(&pool_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_double_vote_panics() {
    let (env, _contract_id, _creator, supporter, pool_id) = setup_pool();
    let client = SponsorPoolClient::new(&env, &_contract_id);

    client.deposit(&pool_id, &supporter, &100_000_000);
    let work_hash = BytesN::from_array(&env, &[0x02u8; 32]);
    client.submit_work(&pool_id, &work_hash);
    client.vote(&pool_id, &supporter, &true);
    client.vote(&pool_id, &supporter, &false);
}

#[test]
fn test_multiple_supporters() {
    let env = Env::default();
    env.mock_all_auths();

    let creator = Address::generate(&env);
    let admin = Address::generate(&env);
    let token = create_token(&env, &admin);
    mint_tokens(&env, &token, &creator, 1_000_000_000);

    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);

    let goal = 100_000_000i128;
    let deadline = env.ledger().timestamp() + 86400;
    let metadata_hash = BytesN::from_array(&env, &[0x01u8; 32]);
    let pool_id = client.create(&creator, &goal, &deadline, &token, &metadata_hash);

    let supporter1 = Address::generate(&env);
    let supporter2 = Address::generate(&env);
    let supporter3 = Address::generate(&env);
    mint_tokens(&env, &token, &supporter1, 1_000_000_000);
    mint_tokens(&env, &token, &supporter2, 1_000_000_000);
    mint_tokens(&env, &token, &supporter3, 1_000_000_000);

    client.deposit(&pool_id, &supporter1, &40_000_000);
    client.deposit(&pool_id, &supporter2, &35_000_000);
    client.deposit(&pool_id, &supporter3, &25_000_000);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.total_deposited, 100_000_000);
    assert_eq!(pool.total_supporters, 3);

    let work_hash = BytesN::from_array(&env, &[0x02u8; 32]);
    client.submit_work(&pool_id, &work_hash);

    client.vote(&pool_id, &supporter1, &true);
    client.vote(&pool_id, &supporter2, &true);
    client.vote(&pool_id, &supporter3, &false);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.yes_votes, 75_000_000);
    assert_eq!(pool.no_votes, 25_000_000);

    env.ledger().set_timestamp(pool.vote_deadline + 1);

    let token_client = token::Client::new(&env, &token);
    let creator_balance_before = token_client.balance(&creator);
    client.finalize(&pool_id);
    let creator_balance_after = token_client.balance(&creator);
    assert_eq!(creator_balance_after - creator_balance_before, 100_000_000);
}

// ─── Issue #1 Regression Tests ─────────────────────────────────

#[test]
#[should_panic(expected = "Error(Contract, #32)")]
fn test_non_admin_set_fee_reverts() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);

    // Deployer calls initialize(admin)
    client.initialize(&admin, &admin);

    // Attacker tries to set fee + redirect treasury
    client.set_fee(&attacker, &500, &attacker);
}

#[test]
#[should_panic(expected = "Error(Contract, #32)")]
fn test_non_admin_withdraw_fees_reverts() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);

    client.initialize(&admin, &admin);
    client.withdraw_fees(&attacker, &100, &Address::generate(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #33)")]
fn test_wrong_pending_admin_accept_reverts() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let impostor = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);

    client.initialize(&admin, &admin);
    client.propose_admin(&admin, &new_admin);
    // Impostor (not the pending admin) tries to accept
    client.accept_admin(&impostor);
}

#[test]
fn test_admin_transfer_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);

    client.initialize(&admin, &admin);
    assert_eq!(client.get_admin(), admin);

    client.propose_admin(&admin, &new_admin);
    client.accept_admin(&new_admin);
    assert_eq!(client.get_admin(), new_admin);
}

#[test]
#[should_panic(expected = "Error(Contract, #34)")]
fn test_deposit_while_paused_reverts() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let supporter = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);

    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);

    let creator = Address::generate(&env);
    env.ledger().set_timestamp(1_000_000);
    let deadline = env.ledger().timestamp() + 86400;
    let pool_id = client.create(&creator, &100_000_000, &deadline, &token, &BytesN::from_array(&env, &[0x01u8; 32]));

    // Admin schedules pause, advances 24h, pauses
    client.schedule_pause(&admin);
    env.ledger().set_timestamp(env.ledger().timestamp() + 86400);
    client.pause(&admin);
    assert!(client.get_paused());

    // Deposit must revert with ContractPaused
    client.deposit(&pool_id, &supporter, &50_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #35)")]
fn test_pause_before_notice_reverts() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);

    env.ledger().set_timestamp(1_000_000);
    // No schedule_pause called — pause must fail with PauseNoticeNotElapsed
    client.pause(&admin);
}

#[test]
fn test_contract_version() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);
    assert_eq!(client.get_contract_version(), 4);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_non_creator_cannot_submit_work_on_used_pool() {
    let (env, _contract_id, _creator, supporter, pool_id) = setup_pool();
    let client = SponsorPoolClient::new(&env, &_contract_id);

    client.deposit(&pool_id, &supporter, &100_000_000);
    let work_hash = BytesN::from_array(&env, &[0x02u8; 32]);
    // Creator submits first (pool -> AWAITING_VOTE)
    client.submit_work(&pool_id, &work_hash);
    // Non-creator (supporter) tries to submit — status check fires #5
    client.submit_work(&pool_id, &work_hash);
}

// ─── Flow Constants Tests (Issue #1, A2) ───────────────────────

#[test]
fn test_flow_constants_defaults() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);

    // Defaults: 7d vote, 24h notice, 48h cooldown
    let (vote, notice, cooldown) = client.get_flow_constants();
    assert_eq!(vote, 604800);
    assert_eq!(notice, 86400);
    assert_eq!(cooldown, 172800);
}

#[test]
fn test_set_flow_constants_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);

    client.set_flow_constants(&admin, &120, &60, &60);
    let (vote, notice, cooldown) = client.get_flow_constants();
    assert_eq!(vote, 120);
    assert_eq!(notice, 60);
    assert_eq!(cooldown, 60);
}

#[test]
#[should_panic(expected = "Error(Contract, #32)")]
fn test_set_flow_constants_non_admin_reverts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let attacker = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);

    client.set_flow_constants(&attacker, &120, &60, &60);
}

#[test]
#[should_panic(expected = "Error(Contract, #39)")]
fn test_set_flow_constants_below_floor_reverts() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);

    // 30s vote deadline < 60s floor
    client.set_flow_constants(&admin, &30, &60, &60);
}

#[test]
fn test_compressed_pause_cycle() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);
    env.ledger().set_timestamp(1_000_000);

    // Create pool BEFORE pausing (create is pause-gated)
    let creator = Address::generate(&env);
    let supporter = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let deadline = env.ledger().timestamp() + 86400;
    let pool_id = client.create(&creator, &100_000_000, &deadline, &token, &BytesN::from_array(&env, &[0x01u8; 32]));

    // Compress timelocks for test
    client.set_flow_constants(&admin, &120, &60, &60);
    client.schedule_pause(&admin);
    env.ledger().set_timestamp(env.ledger().timestamp() + 60);
    client.pause(&admin);
    assert!(client.get_paused());

    // Deposit blocked while paused
    let deposit_result = client.try_deposit(&pool_id, &supporter, &50_000_000);
    assert!(deposit_result.is_err());

    // Unpause after cooldown (60s compressed)
    env.ledger().set_timestamp(env.ledger().timestamp() + 60);
    client.unpause(&admin);
    assert!(!client.get_paused());

    // Deposit works again
    client.deposit(&pool_id, &supporter, &50_000_000);
    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.total_deposited, 50_000_000);
}

#[test]
fn test_compressed_vote_deadline_allows_quick_finalize() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);
    env.ledger().set_timestamp(1_000_000);

    // Compress vote deadline to 120s
    client.set_flow_constants(&admin, &120, &60, &60);

    let creator = Address::generate(&env);
    let supporter = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);

    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.vote(&pool_id, &supporter, &true);

    let pool = client.get_pool(&pool_id).unwrap();
    assert_eq!(pool.vote_deadline, 1_000_120); // now(1_000_000) + 120

    // Advance past compressed vote deadline
    env.ledger().set_timestamp(1_000_121);
    let token_client = token::Client::new(&env, &token);
    let creator_before = token_client.balance(&creator);
    client.finalize(&pool_id);
    let creator_after = token_client.balance(&creator);
    assert_eq!(creator_after - creator_before, 100_000_000);
    assert_eq!(client.get_pool(&pool_id).unwrap().status, 2); // PAID
}

#[test]
fn test_contract_version_is_four() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);
    assert_eq!(client.get_contract_version(), 4);
}

// ─── Clean-Error Regression Tests (WasmVm trap fix) ────────────

#[test]
#[should_panic(expected = "Error(Contract, #33)")]
fn test_accept_admin_no_pending_clean_error() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let caller = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);
    // No pending admin exists — must return clean #33 (not WasmVm trap)
    client.accept_admin(&caller);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_get_pool_nonexistent_clean_error() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);
    // Nonexistent pool — must return clean #2 (not trap)
    client.deposit(&999, &admin, &100);
}

#[test]
#[should_panic(expected = "Error(Contract, #38)")]
fn test_withdraw_fees_no_balance_clean_error() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);
    // No fees collected — clean #38 (balance guard precedes treasury lookup)
    client.withdraw_fees(&admin, &1, &Address::generate(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_raise_dispute_nonexistent_pool_clean_error() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);
    client.raise_dispute(&999, &admin, &0u32, &BytesN::from_array(&env, &[0x03u8; 32]));
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_close_dispute_nonexistent_clean_error() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);
    client.close_dispute(&1, &1);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_appeal_dispute_nonexistent_clean_error() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);
    client.appeal_dispute(&1, &admin, &1);
}

// ─── B1 Audit — Error-path & view coverage batch ───────────────

fn fresh_env() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let supporter = Address::generate(&env);
    (env, admin, creator, supporter)
}

fn setup_initialized() -> (Env, Address, Address, Address, SponsorPoolClient<'static>) {
    let (env, admin, creator, supporter) = fresh_env();
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.initialize(&admin, &admin);
    (env, admin, creator, supporter, client)
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_withdraw_fees_before_initialize() {
    let (env, _a, _c, _s) = fresh_env();
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    client.withdraw_fees(&Address::generate(&env), &1, &Address::generate(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #39)")]
fn test_withdraw_fees_zero_amount() {
    let (env, admin, _c, _s, client) = setup_initialized();
    client.set_fee(&admin, &50, &admin);
    client.withdraw_fees(&admin, &0, &Address::generate(&env));
}

#[test]
#[should_panic(expected = "Error(Contract, #36)")]
fn test_unpause_before_cooldown() {
    let (env, admin, _c, _s, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60);
    client.schedule_pause(&admin);
    env.ledger().set_timestamp(1_000_060);
    client.pause(&admin);
    client.unpause(&admin); // before 60s cooldown
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn test_finalize_before_vote_deadline() {
    let (env, admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    // vote deadline = 1_000_120; finalize at 1_000_100 (< vote deadline AND < pool deadline)
    env.ledger().set_timestamp(1_000_100);
    client.finalize(&pool_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_double_dispute_raise() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    mint_tokens(&env, &token, &creator, 1_000_000_000); // disputant must pay 1% fee
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.raise_dispute(&pool_id, &creator, &0u32, &BytesN::from_array(&env, &[0x03u8; 32]));
    client.raise_dispute(&pool_id, &creator, &0u32, &BytesN::from_array(&env, &[0x03u8; 32]));
}

#[test]
fn test_view_functions() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);

    let p1 = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    let p2 = client.create(&creator, &50_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&p1, &supporter, &30_000_000);
    client.deposit(&p2, &supporter, &20_000_000);

    let by_creator = client.get_pools_by_creator(&creator);
    assert_eq!(by_creator.len(), 2);
    let by_supporter = client.get_pools_by_supporter(&supporter);
    assert_eq!(by_supporter.len(), 2);
    let sup = client.get_supporter(&p1, &supporter).unwrap();
    assert_eq!(sup.amount, 30_000_000);
    assert!(!sup.voted);
    let stats = client.get_platform_stats();
    assert_eq!(stats.pool_count, 2);
    assert_eq!(stats.active_pools, 2);
    let none = client.get_supporter(&p1, &creator);
    assert!(none.is_none());
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_raise_dispute_on_open_pool() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    // Pool is OPEN — raise_dispute must fail with #5
    client.raise_dispute(&pool_id, &creator, &0u32, &BytesN::from_array(&env, &[0x03u8; 32]));
}

#[test]
fn test_resolve_dispute_registers_vote() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    mint_tokens(&env, &token, &creator, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.raise_dispute(&pool_id, &creator, &0u32, &BytesN::from_array(&env, &[0x03u8; 32]));
    let did = 1u32;
    // (KI-014) the resolver must hold platform stake: weight = committed deposits.
    client.resolve_dispute(&pool_id, &supporter, &did, &true, &BytesN::from_array(&env, &[0x04u8; 32]));
    let votes = client.get_arbitrator_votes(&did);
    assert_eq!(votes.len(), 1);
    assert_eq!(votes.get(0).unwrap().vote_for_creator, true);
    assert_eq!(votes.get(0).unwrap().weight, 100_000_000);
    // Double vote on same dispute reverts #26
    let again = client.try_resolve_dispute(&pool_id, &supporter, &did, &true, &BytesN::from_array(&env, &[0x04u8; 32]));
    assert!(again.is_err());
}
// ─── B1 Coverage batch 2 — settlement & guard branches ─────────

#[test]
fn test_full_payout_with_fee_applied() {
    let (env, admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60);
    client.set_fee(&admin, &50, &admin); // 0.5% fee
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.vote(&pool_id, &supporter, &true);
    env.ledger().set_timestamp(1_000_121);
    let token_client = token::Client::new(&env, &token);
    let creator_before = token_client.balance(&creator);
    let admin_before = token_client.balance(&admin);
    client.finalize(&pool_id);
    // creator gets 99.5M, treasury (admin) gets 500K
    assert_eq!(token_client.balance(&creator) - creator_before, 99_500_000);
    assert_eq!(token_client.balance(&admin) - admin_before, 500_000);
    assert_eq!(client.get_total_fees_collected(), 500_000);
    assert_eq!(client.get_pool(&pool_id).unwrap().status, 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #39)")]
fn test_set_flow_constants_above_max() {
    let (env, admin, _c, _s, client) = setup_initialized();
    client.set_flow_constants(&admin, &31_536_001, &60, &60);
}

#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn test_double_initialize() {
    let (env, admin, _c, _s, client) = setup_initialized();
    client.initialize(&admin, &admin);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_propose_admin_self() {
    let (env, admin, _c, _s, client) = setup_initialized();
    client.propose_admin(&admin, &admin);
}

#[test]
#[should_panic(expected = "Error(Contract, #30)")]
fn test_set_fee_above_cap() {
    let (env, admin, _c, _s, client) = setup_initialized();
    client.set_fee(&admin, &501, &admin);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_submit_work_after_deadline() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 60), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    env.ledger().set_timestamp(1_000_061);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_vote_after_vote_deadline() {
    let (env, admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60); // compress vote deadline
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    env.ledger().set_timestamp(1_000_121); // vote deadline = 1_000_120
    client.vote(&pool_id, &supporter, &true);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_vote_non_supporter_unit() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.vote(&pool_id, &creator, &true); // creator is not a supporter
}

#[test]
fn test_referral_reward_credit_and_claim() {
    let (env, admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60);
    client.set_fee(&admin, &50, &admin); // fee funds the referral reward (F-105 cap)
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.register_referral(&creator, &supporter, &pool_id);
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.vote(&pool_id, &supporter, &true);
    env.ledger().set_timestamp(1_000_121);
    let token_client = token::Client::new(&env, &token);
    let creator_before = token_client.balance(&creator);
    client.finalize(&pool_id);
    // Reward credited: 0.5% of 100M = 500K
    let reward = client.claim_referral_reward(&creator);
    assert_eq!(reward, 500_000);
    assert_eq!(token_client.balance(&creator) - creator_before, 99_500_000 + 500_000);
    // Second claim returns 0 (already claimed)
    assert_eq!(client.claim_referral_reward(&creator), 0);
}

// ─── B1 Coverage batch 3 — appeal, treasury, views, cancel guards ─

#[test]
fn test_appeal_full_flow() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    mint_tokens(&env, &token, &creator, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.deposit(&pool_id, &creator, &50_000_000); // creator holds stake (KI-014)
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.raise_dispute(&pool_id, &creator, &0u32, &BytesN::from_array(&env, &[0x03u8; 32]));
    let did = 1u32;
    // Losing round: 1 vote against creator
    client.resolve_dispute(&pool_id, &supporter, &did, &false, &BytesN::from_array(&env, &[0x04u8; 32]));
    // Appeal doubles fee
    client.appeal_dispute(&pool_id, &creator, &did);
    let d = client.get_dispute(&did).unwrap();
    assert_eq!(d.appeal_count, 1);
    assert_eq!(d.fee, 2_000_000); // 1M doubled
    // Appeal round: creator votes for → 1-1 tie → supporters win
    client.resolve_dispute(&pool_id, &creator, &did, &true, &BytesN::from_array(&env, &[0x04u8; 32]));
    client.close_dispute(&pool_id, &did);
    assert_eq!(client.get_pool(&pool_id).unwrap().status, 3); // EXPIRED
    let d = client.get_dispute(&did).unwrap();
    assert_eq!(d.status, 2); // resolved for supporters
    assert!(d.resolved_at > 0);
}

#[test]
fn test_set_fee_treasury_and_views() {
    let (env, admin, _c, _s, client) = setup_initialized();
    client.set_fee(&admin, &50, &admin);
    let new_treasury = Address::generate(&env);
    client.set_fee_treasury(&admin, &new_treasury);
    let (bps, treasury) = client.get_fee();
    assert_eq!(bps, 50);
    assert_eq!(treasury.unwrap(), new_treasury);
    assert_eq!(client.get_total_fees_collected(), 0);
    let (vote, notice, cooldown) = client.get_flow_constants();
    assert_eq!(vote, 604800);
    assert_eq!(notice, 86400);
    assert_eq!(cooldown, 172800);
}

#[test]
#[should_panic(expected = "Error(Contract, #39)")]
fn test_set_flow_notice_below_floor() {
    let (env, admin, _c, _s, client) = setup_initialized();
    client.set_flow_constants(&admin, &120, &30, &60); // notice below 60s floor
}

#[test]
#[should_panic(expected = "Error(Contract, #39)")]
fn test_set_flow_cooldown_below_floor() {
    let (env, admin, _c, _s, client) = setup_initialized();
    client.set_flow_constants(&admin, &120, &60, &30); // cooldown below 60s floor
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_cancel_after_deadline() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 60), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &10_000_000);
    env.ledger().set_timestamp(1_000_061);
    client.cancel_pool(&creator, &pool_id);
}

#[test]
fn test_platform_stats_paid_and_expired() {
    let (env, admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    // PAID pool
    let p1 = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&p1, &supporter, &100_000_000);
    client.submit_work(&p1, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.vote(&p1, &supporter, &true);
    env.ledger().set_timestamp(1_000_121);
    client.finalize(&p1);
    // EXPIRED pool
    let p2 = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 60), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&p2, &supporter, &10_000_000);
    env.ledger().set_timestamp(1_000_200);
    client.finalize(&p2);
    let stats = client.get_platform_stats();
    assert_eq!(stats.pool_count, 2);
    assert_eq!(stats.total_pools_paid, 1);
    assert_eq!(stats.total_pools_expired, 1);
    assert_eq!(stats.total_volume_paid, 100_000_000);
    assert_eq!(stats.active_pools, 0);
}

// ─── B1 Coverage batch 4 — creator-win dispute w/ fee, referral guards, stats, cancel guards ─

#[test]
fn test_close_dispute_creator_wins_with_fee() {
    let (env, admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60);
    client.set_fee(&admin, &500, &admin);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    mint_tokens(&env, &token, &creator, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.raise_dispute(&pool_id, &creator, &0u32, &BytesN::from_array(&env, &[0x03u8; 32]));
    // (KI-014) creator holds stake via a separate pool so they can arbitrate.
    let stake_pool = client.create(&creator, &10_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&stake_pool, &creator, &10_000_000);
    client.resolve_dispute(&pool_id, &creator, &1, &true, &BytesN::from_array(&env, &[0x04u8; 32]));
    client.close_dispute(&pool_id, &1);
    assert_eq!(client.get_pool(&pool_id).unwrap().status, 2); // STATUS_PAID
    let d = client.get_dispute(&1).unwrap();
    assert_eq!(d.status, 1); // resolved for creator
    assert_eq!(client.get_total_fees_collected(), 5_000_000); // 100M * 5%
    let token_client = token::Client::new(&env, &token);
    assert_eq!(token_client.balance(&creator), 1_000_000_000 - 10_000_000 + 95_000_000); // mint − stake deposit + payout minus fee
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_register_referral_self() {
    let (env, _admin, creator, _s, client) = setup_initialized();
    client.register_referral(&creator, &creator, &1);
}

#[test]
fn test_register_referral_duplicate_and_get() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.register_referral(&creator, &supporter, &pool_id);
    client.register_referral(&creator, &supporter, &pool_id); // duplicate — no-op
    let refs = client.get_referrals(&creator);
    assert_eq!(refs.len(), 1);
    assert_eq!(refs.get(0).unwrap().referee, supporter);
}

#[test]
fn test_stats_counts_disputed() {
    let (env, admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    mint_tokens(&env, &token, &creator, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.raise_dispute(&pool_id, &creator, &0u32, &BytesN::from_array(&env, &[0x03u8; 32]));
    let stats = client.get_platform_stats();
    assert_eq!(stats.total_pools_disputed, 1);
    assert_eq!(stats.active_pools, 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_cancel_with_work_submitted() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.cancel_pool(&creator, &pool_id);
}

// ─── B1 Coverage batch 5 — final gaps ─

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_get_admin_before_init() {
    let (env, _a, _c, _s) = fresh_env();
    let contract_id = env.register_contract(None, SponsorPool);
    let client = SponsorPoolClient::new(&env, &contract_id);
    let _ = client.try_get_admin().unwrap_err();
    client.get_admin();
    panic!("should not reach");
}
#[test]
fn test_stats_counts_open_pool() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    let stats = client.get_platform_stats();
    assert_eq!(stats.pool_count, 1);
    assert_eq!(stats.active_pools, 1);
}


// ─── B1.3 regression tests for audit findings ─

#[test]
fn regress_f401_withdraw_fees_guarded_and_transfers() {
    let (env, admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60);
    client.set_fee(&admin, &500, &admin);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    mint_tokens(&env, &token, &creator, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    let token_client = token::Client::new(&env, &token);
    let treasury_before = token_client.balance(&admin);
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.vote(&pool_id, &supporter, &true);
    env.ledger().set_timestamp(1_000_200);
    client.finalize(&pool_id);
    let fees = client.get_total_fees_collected();
    assert_eq!(fees, 5_000_000);
    // Fee was delivered to the treasury at settlement; the contract holds 0.
    assert_eq!(token_client.balance(&client.address), 0);
    assert_eq!(token_client.balance(&admin), treasury_before + 5_000_000);
    // Withdrawing more than the contract actually holds must revert (#38):
    // protects non-fee funds (e.g. orphaned refunds) from phantom withdrawal.
    let overdraft = client.try_withdraw_fees(&admin, &fees, &token);
    assert!(overdraft.is_err());
    assert_eq!(client.get_total_fees_collected(), 5_000_000);
    // Surplus case: contract receives tokens (e.g. failed try_transfer refunds);
    // withdraw_fees must transfer them to the treasury, not just bookkeeping.
    mint_tokens(&env, &token, &client.address, 2_000_000);
    client.withdraw_fees(&admin, &2_000_000, &token);
    assert_eq!(token_client.balance(&admin), treasury_before + 5_000_000 + 2_000_000);
    assert_eq!(token_client.balance(&client.address), 0);
    assert_eq!(client.get_total_fees_collected(), 3_000_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #41)")]
fn regress_f501_finalize_blocked_during_dispute() {
    let (env, admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    mint_tokens(&env, &token, &creator, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.vote(&pool_id, &supporter, &true);
    client.raise_dispute(&pool_id, &creator, &0u32, &BytesN::from_array(&env, &[0x03u8; 32]));
    env.ledger().set_timestamp(1_000_200);
    client.finalize(&pool_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #40)")]
fn regress_f101_creator_cannot_vote() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    mint_tokens(&env, &token, &creator, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &creator, &10_000_000); // creator self-deposit allowed
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.vote(&pool_id, &creator, &true); // must revert #40
}

#[test]
fn regress_f105_referral_capped_at_fee() {
    let (env, admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60);
    client.set_fee(&admin, &50, &admin); // 0.5% fee
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    mint_tokens(&env, &token, &creator, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    // creator pre-registers ALL supporters as referees (self-credit attempt)
    client.register_referral(&creator, &supporter, &pool_id);
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.vote(&pool_id, &supporter, &true);
    env.ledger().set_timestamp(1_000_200);
    client.finalize(&pool_id);
    // fee = 500K; attempted reward = 500K (0.5% of 100M) == fee → cap allows full
    let claim = client.claim_referral_reward(&creator);
    assert_eq!(claim, 500_000);
    // A second supporter doubles the attempted credit beyond the fee cap.
    let supporter2 = Address::generate(&env);
    mint_tokens(&env, &token, &supporter2, 1_000_000_000);
    let pool2 = client.create(&creator, &200_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x05u8; 32]));
    client.register_referral(&creator, &supporter, &pool2);
    client.register_referral(&creator, &supporter2, &pool2);
    client.deposit(&pool2, &supporter, &100_000_000);
    client.deposit(&pool2, &supporter2, &100_000_000);
    client.submit_work(&pool2, &BytesN::from_array(&env, &[0x06u8; 32]));
    client.vote(&pool2, &supporter, &true);
    client.vote(&pool2, &supporter2, &true);
    env.ledger().set_timestamp(1_000_400);
    client.finalize(&pool2);
    // fee = 1M; attempted = 1M (2 × 0.5% of 100M) → capped at fee 1M
    let claim2 = client.claim_referral_reward(&creator);
    assert_eq!(claim2, 1_000_000);
    let token_client = token::Client::new(&env, &token);
    assert_eq!(token_client.balance(&client.address), 0); // contract drained of fee
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn regress_f105_register_referral_unknown_pool() {
    let (env, _admin, creator, _s, client) = setup_initialized();
    client.register_referral(&creator, &Address::generate(&env), &999_999);
}

#[test]
fn regress_f201_ttl_refreshed_on_read() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &10_000_000);
    // 40 days later, a mutation read must still see the pool (TTL refreshed).
    env.ledger().set_timestamp(1_000_000 + 40 * 86400);
    let p = client.get_pool(&pool_id).unwrap();
    assert_eq!(p.status, 0);
    client.finalize(&pool_id);
    assert_eq!(client.get_pool(&pool_id).unwrap().status, 3); // EXPIRED via refund
}

#[test]
fn regress_f601_appeal_emits_event() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    mint_tokens(&env, &token, &creator, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &100_000_000);
    client.submit_work(&pool_id, &BytesN::from_array(&env, &[0x02u8; 32]));
    client.raise_dispute(&pool_id, &creator, &0u32, &BytesN::from_array(&env, &[0x03u8; 32]));
    client.appeal_dispute(&pool_id, &creator, &1);
    let events = env.events().all();
    let appealed = events.iter().any(|(_addr, topics, _data)| {
        topics
            .get(0)
            .map(|t| { let s: soroban_sdk::Symbol = soroban_sdk::Symbol::try_from_val(&env, &t).unwrap(); s == soroban_sdk::symbol_short!("p_appl") })
            .unwrap_or(false)
    });
    assert!(appealed, "p_appl event must be emitted");
}

// ─── KI-016: claim_refund regression ─

#[test]
#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn regress_ki016_claim_refund_rejects_non_expired() {
    let (env, _admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &10_000_000);
    client.claim_refund(&supporter, &pool_id);
}

#[test]
fn regress_ki016_claim_refund_full_cycle() {
    let (env, admin, creator, supporter, client) = setup_initialized();
    env.ledger().set_timestamp(1_000_000);
    client.set_flow_constants(&admin, &120, &60, &60);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);
    mint_tokens(&env, &token, &supporter, 1_000_000_000);
    let pool_id = client.create(&creator, &100_000_000, &(env.ledger().timestamp() + 3600), &token, &BytesN::from_array(&env, &[0x01u8; 32]));
    client.deposit(&pool_id, &supporter, &10_000_000);
    env.ledger().set_timestamp(1_003_601); // deadline passed, goal unmet
    client.finalize(&pool_id); // refund path; supporter reachable → refunded
    let token_client = token::Client::new(&env, &token);
    let sup_bal = token_client.balance(&supporter);
    assert_eq!(sup_bal, 1_000_000_000); // refund already delivered at finalize
    // supporter's claimable amount is 0 → double-claim reverts #8
    let s = client.get_supporter(&pool_id, &supporter).unwrap();
    assert_eq!(s.amount, 0);
    let again = client.try_claim_refund(&supporter, &pool_id);
    assert!(again.is_err());
}
