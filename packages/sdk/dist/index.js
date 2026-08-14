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
var BASE_URL = "https://api.kindlepool.dev";
var KindlePoolAPI = class {
  baseUrl;
  apiKey;
  constructor(options) {
    this.baseUrl = options?.baseUrl ?? BASE_URL;
    this.apiKey = options?.apiKey;
  }
  get headers() {
    const h = { "Content-Type": "application/json" };
    if (this.apiKey) h["X-API-Key"] = this.apiKey;
    return h;
  }
  async fetch(path, init) {
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { ...this.headers, ...init?.headers } });
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
  async createPool(params, source, signer) {
    const account = await this.server.getAccount(source);
    const tx = new import_stellar_sdk.TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call(
      "create",
      (0, import_stellar_sdk.nativeToScVal)(params.creator, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(params.goal, { type: "i128" }),
      (0, import_stellar_sdk.nativeToScVal)(params.deadline, { type: "u64" }),
      (0, import_stellar_sdk.nativeToScVal)(params.token, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(Buffer.from(params.metadata_hash.replace("0x", ""), "hex"), { type: "bytes" })
    )).setTimeout(300).build();
    tx.sign(signer);
    return this.submitAndWait(tx);
  }
  async deposit(params, source, signer) {
    const account = await this.server.getAccount(source);
    const tx = new import_stellar_sdk.TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call(
      "deposit",
      (0, import_stellar_sdk.nativeToScVal)(params.pool_id, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(params.supporter, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(BigInt(params.amount), { type: "i128" })
    )).setTimeout(300).build();
    tx.sign(signer);
    return this.submitAndWait(tx);
  }
  async submitWork(poolId, workHash, source, signer) {
    const account = await this.server.getAccount(source);
    const tx = new import_stellar_sdk.TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call(
      "submit_work",
      (0, import_stellar_sdk.nativeToScVal)(poolId, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(Buffer.from(workHash.replace("0x", ""), "hex"), { type: "bytes" })
    )).setTimeout(300).build();
    tx.sign(signer);
    return this.submitAndWait(tx);
  }
  async vote(params, source, signer) {
    const account = await this.server.getAccount(source);
    const tx = new import_stellar_sdk.TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call(
      "vote",
      (0, import_stellar_sdk.nativeToScVal)(params.pool_id, { type: "u32" }),
      (0, import_stellar_sdk.nativeToScVal)(params.voter, { type: "address" }),
      (0, import_stellar_sdk.nativeToScVal)(params.approve, { type: "bool" })
    )).setTimeout(300).build();
    tx.sign(signer);
    return this.submitAndWait(tx);
  }
  async finalize(poolId, source, signer) {
    const account = await this.server.getAccount(source);
    const tx = new import_stellar_sdk.TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call("finalize", (0, import_stellar_sdk.nativeToScVal)(poolId, { type: "u32" }))).setTimeout(300).build();
    tx.sign(signer);
    return this.submitAndWait(tx);
  }
  async submitAndWait(tx) {
    const result = await this.server.sendTransaction(tx);
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
      if (receipt.status === "FAILED") throw new Error(`Transaction failed: ${hash}`);
      attempts++;
    }
    throw new Error("Transaction timeout");
  }
};

// src/index.ts
var VERSION = "0.1.0";
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  KindlePoolAPI,
  KindlePoolContract,
  VERSION
});
