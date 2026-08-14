// src/contract.ts
import { SorobanRpc, Contract, TransactionBuilder, Networks, nativeToScVal } from "@stellar/stellar-sdk";
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
  async createPool(params, source, signer) {
    const account = await this.server.getAccount(source);
    const tx = new TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call(
      "create",
      nativeToScVal(params.creator, { type: "address" }),
      nativeToScVal(params.goal, { type: "i128" }),
      nativeToScVal(params.deadline, { type: "u64" }),
      nativeToScVal(params.token, { type: "address" }),
      nativeToScVal(Buffer.from(params.metadata_hash.replace("0x", ""), "hex"), { type: "bytes" })
    )).setTimeout(300).build();
    tx.sign(signer);
    return this.submitAndWait(tx);
  }
  async deposit(params, source, signer) {
    const account = await this.server.getAccount(source);
    const tx = new TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call(
      "deposit",
      nativeToScVal(params.pool_id, { type: "u32" }),
      nativeToScVal(params.supporter, { type: "address" }),
      nativeToScVal(BigInt(params.amount), { type: "i128" })
    )).setTimeout(300).build();
    tx.sign(signer);
    return this.submitAndWait(tx);
  }
  async submitWork(poolId, workHash, source, signer) {
    const account = await this.server.getAccount(source);
    const tx = new TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call(
      "submit_work",
      nativeToScVal(poolId, { type: "u32" }),
      nativeToScVal(Buffer.from(workHash.replace("0x", ""), "hex"), { type: "bytes" })
    )).setTimeout(300).build();
    tx.sign(signer);
    return this.submitAndWait(tx);
  }
  async vote(params, source, signer) {
    const account = await this.server.getAccount(source);
    const tx = new TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call(
      "vote",
      nativeToScVal(params.pool_id, { type: "u32" }),
      nativeToScVal(params.voter, { type: "address" }),
      nativeToScVal(params.approve, { type: "bool" })
    )).setTimeout(300).build();
    tx.sign(signer);
    return this.submitAndWait(tx);
  }
  async finalize(poolId, source, signer) {
    const account = await this.server.getAccount(source);
    const tx = new TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase }).addOperation(this.contract.call("finalize", nativeToScVal(poolId, { type: "u32" }))).setTimeout(300).build();
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

export {
  KindlePoolContract
};
