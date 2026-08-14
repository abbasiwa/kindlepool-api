import { Keypair } from '@stellar/stellar-sdk';
import { CreatePoolParams, DepositParams, VoteParams } from './types.js';

declare class KindlePoolContract {
    private server;
    private contract;
    private passphrase;
    private fee;
    constructor(contractId: string, options?: {
        rpcUrl?: string;
        passphrase?: string;
        fee?: string;
    });
    createPool(params: CreatePoolParams, source: string, signer: Keypair): Promise<string>;
    deposit(params: DepositParams, source: string, signer: Keypair): Promise<string>;
    submitWork(poolId: number, workHash: string, source: string, signer: Keypair): Promise<string>;
    vote(params: VoteParams, source: string, signer: Keypair): Promise<string>;
    finalize(poolId: number, source: string, signer: Keypair): Promise<string>;
    private submitAndWait;
}

export { KindlePoolContract };
