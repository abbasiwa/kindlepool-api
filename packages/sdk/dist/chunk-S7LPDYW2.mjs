// src/contract.ts
import { SorobanRpc, Contract, TransactionBuilder, Networks, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
var DEFAULT_RPC = "https://soroban-testnet.stellar.org";
var DEFAULT_FEE = "100000";
var DEFAULT_PASSPHRASE = Networks.TESTNET;
var KindlePoolContract = class {
  server;
  contract;
  passphrase;
  fee;
  constructor(contractId, options) {
    const rpcUrl = options?.rpcUrl ?? DEFAULT_RPC;
    this.server = new SorobanRpc.Server(rpcUrl);
    this.contract = new Contract(contractId);
    this.passphrase = options?.passphrase ?? DEFAULT_PASSPHRASE;
    this.fee = options?.fee ?? DEFAULT_FEE;
  }
  /** Build + simulate + assemble a Soroban invoke tx. Returns an unsigned transaction. */
  async buildInvoke(source, method, args) {
    const account = await this.server.getAccount(source);
    const base = new TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call(method, ...args)).setTimeout(300).build();
    const sim = await this.server.simulateTransaction(base);
    if ("error" in sim && sim.error) {
      throw new Error(`Simulation failed for ${method}: ${sim.error}`);
    }
    if (!("result" in sim) || !sim.result) {
      throw new Error(`Simulation failed for ${method}: no result`);
    }
    return SorobanRpc.assembleTransaction(base, sim).build();
  }
  /** Build, simulate, sign (via signer), and submit. Returns the tx hash. */
  async signAndSend(source, method, args, signer) {
    const tx = await this.buildInvoke(source, method, args);
    const signedXdr = await signer.signTransaction(tx.toXDR(), { networkPassphrase: this.passphrase });
    const signed = TransactionBuilder.fromXDR(signedXdr, this.passphrase);
    const result = await this.server.sendTransaction(signed);
    return this.awaitResult(result);
  }
  async awaitResult(result) {
    if (result.status !== "PENDING") {
      throw new Error(`Transaction rejected: ${result.status}`);
    }
    const hash = result.hash;
    if (!hash) throw new Error("No transaction hash returned");
    let attempts = 0;
    while (attempts < 30) {
      await new Promise((r) => setTimeout(r, 1e3));
      const receipt = await this.server.getTransaction(hash);
      if (receipt.status === "SUCCESS") return hash;
      if (receipt.status === "FAILED") {
        const resultMeta = receipt.resultMetaXdr;
        throw new Error(`Transaction failed: ${hash} ${resultMeta ? " (see meta)" : ""}`);
      }
      attempts++;
    }
    throw new Error("Transaction timeout");
  }
  // ─── Pool lifecycle ──────────────────────────────────────────
  create(params, source, signer) {
    return this.signAndSend(source, "create", [
      nativeToScVal(params.creator, { type: "address" }),
      nativeToScVal(BigInt(params.goal), { type: "i128" }),
      nativeToScVal(params.deadline, { type: "u64" }),
      nativeToScVal(params.token, { type: "address" }),
      nativeToScVal(Buffer.from(params.metadata_hash.replace("0x", ""), "hex"), { type: "bytes" })
    ], signer);
  }
  deposit(params, source, signer) {
    return this.signAndSend(source, "deposit", [
      nativeToScVal(params.pool_id, { type: "u32" }),
      nativeToScVal(params.supporter, { type: "address" }),
      nativeToScVal(BigInt(params.amount), { type: "i128" })
    ], signer);
  }
  submitWork(poolId, workHash, source, signer) {
    return this.signAndSend(source, "submit_work", [
      nativeToScVal(poolId, { type: "u32" }),
      nativeToScVal(Buffer.from(workHash.replace("0x", ""), "hex"), { type: "bytes" })
    ], signer);
  }
  vote(params, source, signer) {
    return this.signAndSend(source, "vote", [
      nativeToScVal(params.pool_id, { type: "u32" }),
      nativeToScVal(params.voter, { type: "address" }),
      nativeToScVal(params.approve, { type: "bool" })
    ], signer);
  }
  finalize(poolId, source, signer) {
    return this.signAndSend(source, "finalize", [nativeToScVal(poolId, { type: "u32" })], signer);
  }
  claimRefund(supporter, poolId, source, signer) {
    return this.signAndSend(source, "claim_refund", [
      nativeToScVal(supporter, { type: "address" }),
      nativeToScVal(poolId, { type: "u32" })
    ], signer);
  }
  cancelPool(caller, poolId, source, signer) {
    return this.signAndSend(source, "cancel_pool", [
      nativeToScVal(caller, { type: "address" }),
      nativeToScVal(poolId, { type: "u32" })
    ], signer);
  }
  // ─── Disputes ────────────────────────────────────────────────
  raiseDispute(params, source, signer) {
    return this.signAndSend(source, "raise_dispute", [
      nativeToScVal(params.pool_id, { type: "u32" }),
      nativeToScVal(params.disputant, { type: "address" }),
      nativeToScVal(params.reason, { type: "u32" }),
      nativeToScVal(Buffer.from(params.evidence_hash.replace("0x", ""), "hex"), { type: "bytes" })
    ], signer);
  }
  resolveDispute(params, source, signer) {
    return this.signAndSend(source, "resolve_dispute", [
      nativeToScVal(params.pool_id, { type: "u32" }),
      nativeToScVal(params.caller, { type: "address" }),
      nativeToScVal(params.dispute_id, { type: "u32" }),
      nativeToScVal(params.vote_for_creator, { type: "bool" }),
      nativeToScVal(Buffer.from(params.reason_hash.replace("0x", ""), "hex"), { type: "bytes" })
    ], signer);
  }
  closeDispute(poolId, disputeId, source, signer) {
    return this.signAndSend(source, "close_dispute", [
      nativeToScVal(poolId, { type: "u32" }),
      nativeToScVal(disputeId, { type: "u32" })
    ], signer);
  }
  appealDispute(poolId, disputant, disputeId, source, signer) {
    return this.signAndSend(source, "appeal_dispute", [
      nativeToScVal(poolId, { type: "u32" }),
      nativeToScVal(disputant, { type: "address" }),
      nativeToScVal(disputeId, { type: "u32" })
    ], signer);
  }
  // ─── Referrals ───────────────────────────────────────────────
  registerReferral(referrer, referee, poolId, source, signer) {
    return this.signAndSend(source, "register_referral", [
      nativeToScVal(referrer, { type: "address" }),
      nativeToScVal(referee, { type: "address" }),
      nativeToScVal(poolId, { type: "u32" })
    ], signer);
  }
  claimReferralReward(referrer, source, signer) {
    return this.signAndSend(source, "claim_referral_reward", [
      nativeToScVal(referrer, { type: "address" })
    ], signer);
  }
  // ─── Views (read-only, no signer) ────────────────────────────
  async getPool(poolId) {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(await this.server.getAccount("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"), {
        fee: this.fee,
        networkPassphrase: this.passphrase
      }).addOperation(this.contract.call("get_pool", nativeToScVal(poolId, { type: "u32" }))).setTimeout(300).build()
    );
    if (!("result" in result) || !result.result) throw new Error("simulation failed");
    return scValToNative(result.result.retval);
  }
};

export {
  KindlePoolContract
};
