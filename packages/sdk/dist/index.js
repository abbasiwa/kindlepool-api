"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  KindlePoolAPI: () => KindlePoolAPI,
  KindlePoolContract: () => KindlePoolContract,
  VERSION: () => VERSION
});
module.exports = __toCommonJS(index_exports);

// src/api.ts
var DEFAULT_BASE_URL = "https://kindlepool-api.herokuapp.com";
var KindlePoolAPI = class {
  baseUrl;
  apiKey;
  constructor(options) {
    const envUrl = typeof process !== "undefined" && process.env?.KINDPOOL_API_URL ? process.env.KINDPOOL_API_URL : void 0;
    this.baseUrl = options?.baseUrl ?? envUrl ?? DEFAULT_BASE_URL;
    this.apiKey = options?.apiKey;
  }
  get headers() {
    const h = { "Content-Type": "application/json" };
    if (this.apiKey) h["X-API-Key"] = this.apiKey;
    return h;
  }
  // All indexer endpoints live under /api/v1 (audit #10).
  async fetch(path, init) {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, { ...init, headers: { ...this.headers, ...init?.headers } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`KindlePool API ${res.status}: ${body}`);
    }
    return res.json();
  }
  async listPools(params) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.creator) q.set("creator", params.creator);
    if (params?.sort) q.set("sort", params.sort);
    if (params?.page) q.set("page", String(params.page));
    if (params?.limit) q.set("limit", String(params.limit));
    return this.fetch(`/pools?${q.toString()}`);
  }
  async getPool(id) {
    return this.fetch(`/pools/${id}`);
  }
  async getPoolSupporters(poolId) {
    return this.fetch(`/pools/${poolId}/supporters`);
  }
  async getPoolEvents(poolId, limit) {
    const q = limit ? `?limit=${limit}` : "";
    return this.fetch(`/pools/${poolId}/events${q}`);
  }
  async getPoolsBySupporter(address) {
    return this.fetch(`/supporters/${address}/pools`);
  }
  async getPoolsByCreator(address) {
    return this.fetch(`/creators/${address}/pools`);
  }
  async getEvents(params) {
    const q = new URLSearchParams();
    if (params?.type) q.set("type", params.type);
    if (params?.limit) q.set("limit", String(params.limit));
    return this.fetch(`/events?${q.toString()}`);
  }
  async health() {
    return this.fetch("/health");
  }
};

// src/contract.ts
var import_stellar_sdk = require("@stellar/stellar-sdk");
var DEFAULT_RPC = "https://soroban-testnet.stellar.org";
var DEFAULT_FEE = "100000";
var DEFAULT_PASSPHRASE = import_stellar_sdk.Networks.TESTNET;
var KindlePoolContract = class {
  server;
  contract;
  passphrase;
  fee;
  constructor(contractId, options) {
    const rpcUrl = options?.rpcUrl ?? DEFAULT_RPC;
    this.server = new import_stellar_sdk.SorobanRpc.Server(rpcUrl);
    this.contract = new import_stellar_sdk.Contract(contractId);
    this.passphrase = options?.passphrase ?? DEFAULT_PASSPHRASE;
    this.fee = options?.fee ?? DEFAULT_FEE;
  }
  /** Build + simulate + assemble a Soroban invoke tx. Returns an unsigned transaction. */
  async buildInvoke(source, method, args) {
    const account = await this.server.getAccount(source);
    const base = new import_stellar_sdk.TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call(method, ...args)).setTimeout(300).build();
    const sim = await this.server.simulateTransaction(base);
    if ("error" in sim && sim.error) {
      throw new Error(`Simulation failed for ${method}: ${sim.error}`);
    }
    if (!("result" in sim) || !sim.result) {
      throw new Error(`Simulation failed for ${method}: no result`);
    }
    return import_stellar_sdk.SorobanRpc.assembleTransaction(base, sim).build();
  }
  /** Build, simulate, sign (via signer), and submit. Returns the tx hash. */
  async signAndSend(source, method, args, signer) {
    const tx = await this.buildInvoke(source, method, args);
    const signedXdr = await signer.signTransaction(tx.toXDR(), { networkPassphrase: this.passphrase });
    const signed = import_stellar_sdk.TransactionBuilder.fromXDR(signedXdr, this.passphrase);
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
      (0, import_stellar_sdk.nativeToScVal)(params.creator, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(BigInt(params.goal), { type: "i128" }),
      (0, import_stellar_sdk.nativeToScVal)(params.deadline, { type: "u64" }),
      (0, import_stellar_sdk.nativeToScVal)(params.token, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(Buffer.from(params.metadata_hash.replace("0x", ""), "hex"), { type: "bytes" })
    ], signer);
  }
  deposit(params, source, signer) {
    return this.signAndSend(source, "deposit", [
      (0, import_stellar_sdk.nativeToScVal)(params.pool_id, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(params.supporter, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(BigInt(params.amount), { type: "i128" })
    ], signer);
  }
  submitWork(poolId, workHash, source, signer) {
    return this.signAndSend(source, "submit_work", [
      (0, import_stellar_sdk.nativeToScVal)(poolId, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(Buffer.from(workHash.replace("0x", ""), "hex"), { type: "bytes" })
    ], signer);
  }
  vote(params, source, signer) {
    return this.signAndSend(source, "vote", [
      (0, import_stellar_sdk.nativeToScVal)(params.pool_id, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(params.voter, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(params.approve, { type: "bool" })
    ], signer);
  }
  finalize(poolId, source, signer) {
    return this.signAndSend(source, "finalize", [(0, import_stellar_sdk.nativeToScVal)(poolId, { type: "u32" })], signer);
  }
  claimRefund(supporter, poolId, source, signer) {
    return this.signAndSend(source, "claim_refund", [
      (0, import_stellar_sdk.nativeToScVal)(supporter, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(poolId, { type: "u32" })
    ], signer);
  }
  cancelPool(caller, poolId, source, signer) {
    return this.signAndSend(source, "cancel_pool", [
      (0, import_stellar_sdk.nativeToScVal)(caller, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(poolId, { type: "u32" })
    ], signer);
  }
  // ─── Disputes ────────────────────────────────────────────────
  raiseDispute(params, source, signer) {
    return this.signAndSend(source, "raise_dispute", [
      (0, import_stellar_sdk.nativeToScVal)(params.pool_id, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(params.disputant, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(params.reason, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(Buffer.from(params.evidence_hash.replace("0x", ""), "hex"), { type: "bytes" })
    ], signer);
  }
  resolveDispute(params, source, signer) {
    return this.signAndSend(source, "resolve_dispute", [
      (0, import_stellar_sdk.nativeToScVal)(params.pool_id, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(params.caller, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(params.dispute_id, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(params.vote_for_creator, { type: "bool" }),
      (0, import_stellar_sdk.nativeToScVal)(Buffer.from(params.reason_hash.replace("0x", ""), "hex"), { type: "bytes" })
    ], signer);
  }
  closeDispute(poolId, disputeId, source, signer) {
    return this.signAndSend(source, "close_dispute", [
      (0, import_stellar_sdk.nativeToScVal)(poolId, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(disputeId, { type: "u32" })
    ], signer);
  }
  appealDispute(poolId, disputant, disputeId, source, signer) {
    return this.signAndSend(source, "appeal_dispute", [
      (0, import_stellar_sdk.nativeToScVal)(poolId, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(disputant, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(disputeId, { type: "u32" })
    ], signer);
  }
  // ─── Referrals ───────────────────────────────────────────────
  registerReferral(referrer, referee, poolId, source, signer) {
    return this.signAndSend(source, "register_referral", [
      (0, import_stellar_sdk.nativeToScVal)(referrer, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(referee, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(poolId, { type: "u32" })
    ], signer);
  }
  claimReferralReward(referrer, source, signer) {
    return this.signAndSend(source, "claim_referral_reward", [
      (0, import_stellar_sdk.nativeToScVal)(referrer, { type: "address" })
    ], signer);
  }
  // ─── Views (read-only, no signer) ────────────────────────────
  async getPool(poolId) {
    const result = await this.server.simulateTransaction(
      new import_stellar_sdk.TransactionBuilder(await this.server.getAccount("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"), {
        fee: this.fee,
        networkPassphrase: this.passphrase
      }).addOperation(this.contract.call("get_pool", (0, import_stellar_sdk.nativeToScVal)(poolId, { type: "u32" }))).setTimeout(300).build()
    );
    if (!("result" in result) || !result.result) throw new Error("simulation failed");
    return (0, import_stellar_sdk.scValToNative)(result.result.retval);
  }
};

// src/index.ts
var VERSION = "0.2.0";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  KindlePoolAPI,
  KindlePoolContract,
  VERSION
});
