import { CreatePoolParams, DepositParams, VoteParams, RaiseDisputeParams, ResolveDisputeParams } from './types.mjs';

/**
 * A wallet signer abstraction. The browser passes a Freighter-backed signer;
 * the backend may pass a Keypair-backed signer. The signer receives a base64
 * TransactionEnvelope XDR and returns the signed base64 XDR.
 */
interface TxSigner {
    signTransaction(xdr: string, opts?: {
        networkPassphrase?: string;
    }): Promise<string>;
}
interface KindlePoolContractOptions {
    rpcUrl?: string;
    passphrase?: string;
    fee?: string;
}
declare class KindlePoolContract {
    private server;
    private contract;
    private passphrase;
    private fee;
    constructor(contractId: string, options?: KindlePoolContractOptions);
    /** Build + simulate + assemble a Soroban invoke tx. Returns an unsigned transaction. */
    private buildInvoke;
    /** Build, simulate, sign (via signer), and submit. Returns the tx hash. */
    private signAndSend;
    private awaitResult;
    create(params: CreatePoolParams, source: string, signer: TxSigner): Promise<string>;
    deposit(params: DepositParams, source: string, signer: TxSigner): Promise<string>;
    submitWork(poolId: number, workHash: string, source: string, signer: TxSigner): Promise<string>;
    vote(params: VoteParams, source: string, signer: TxSigner): Promise<string>;
    finalize(poolId: number, source: string, signer: TxSigner): Promise<string>;
    claimRefund(supporter: string, poolId: number, source: string, signer: TxSigner): Promise<string>;
    cancelPool(caller: string, poolId: number, source: string, signer: TxSigner): Promise<string>;
    raiseDispute(params: RaiseDisputeParams, source: string, signer: TxSigner): Promise<string>;
    resolveDispute(params: ResolveDisputeParams, source: string, signer: TxSigner): Promise<string>;
    closeDispute(poolId: number, disputeId: number, source: string, signer: TxSigner): Promise<string>;
    appealDispute(poolId: number, disputant: string, disputeId: number, source: string, signer: TxSigner): Promise<string>;
    registerReferral(referrer: string, referee: string, poolId: number, source: string, signer: TxSigner): Promise<string>;
    claimReferralReward(referrer: string, source: string, signer: TxSigner): Promise<string>;
    getPool(poolId: number): Promise<any>;
}

export { KindlePoolContract, type KindlePoolContractOptions, type TxSigner };
