import { SorobanRpc, Contract, TransactionBuilder, Transaction, Networks, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk'
import type {
  CreatePoolParams,
  DepositParams,
  VoteParams,
  RaiseDisputeParams,
  ResolveDisputeParams,
} from './types'

const DEFAULT_RPC = 'https://soroban-testnet.stellar.org'
const DEFAULT_FEE = '100000'
const DEFAULT_PASSPHRASE = Networks.TESTNET

/**
 * A wallet signer abstraction. The browser passes a Freighter-backed signer;
 * the backend may pass a Keypair-backed signer. The signer receives a base64
 * TransactionEnvelope XDR and returns the signed base64 XDR.
 */
export interface TxSigner {
  signTransaction(xdr: string, opts?: { networkPassphrase?: string }): Promise<string>
}

export interface KindlePoolContractOptions {
  rpcUrl?: string
  passphrase?: string
  fee?: string
}

export class KindlePoolContract {
  private server: SorobanRpc.Server
  private contract: Contract
  private passphrase: string
  private fee: string

  constructor(contractId: string, options?: KindlePoolContractOptions) {
    const rpcUrl = options?.rpcUrl ?? DEFAULT_RPC
    this.server = new SorobanRpc.Server(rpcUrl)
    this.contract = new Contract(contractId)
    this.passphrase = options?.passphrase ?? DEFAULT_PASSPHRASE
    this.fee = options?.fee ?? DEFAULT_FEE
  }

  /** Build + simulate + assemble a Soroban invoke tx. Returns an unsigned transaction. */
  private async buildInvoke(
    source: string,
    method: string,
    args: xdr.ScVal[],
  ): Promise<Transaction> {
    const account = await this.server.getAccount(source)
    const base = new TransactionBuilder(account, { fee: this.fee, networkPassphrase: this.passphrase })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(300)
      .build()

    const sim = await this.server.simulateTransaction(base)
    if ('error' in sim && sim.error) {
      throw new Error(`Simulation failed for ${method}: ${sim.error}`)
    }
    if (!('result' in sim) || !sim.result) {
      throw new Error(`Simulation failed for ${method}: no result`)
    }
    return SorobanRpc.assembleTransaction(base, sim).build()
  }

  /** Build, simulate, sign (via signer), and submit. Returns the tx hash. */
  private async signAndSend(source: string, method: string, args: xdr.ScVal[], signer: TxSigner): Promise<string> {
    const tx = await this.buildInvoke(source, method, args)
    const signedXdr = await signer.signTransaction(tx.toXDR(), { networkPassphrase: this.passphrase })
    const signed = TransactionBuilder.fromXDR(signedXdr, this.passphrase)
    const result = await this.server.sendTransaction(signed)
    return this.awaitResult(result)
  }

  private async awaitResult(result: SorobanRpc.Api.SendTransactionResponse): Promise<string> {
    if (result.status !== 'PENDING') {
      throw new Error(`Transaction rejected: ${result.status}`)
    }
    const hash = result.hash
    if (!hash) throw new Error('No transaction hash returned')

    let attempts = 0
    while (attempts < 30) {
      await new Promise((r) => setTimeout(r, 1000))
      const receipt = await this.server.getTransaction(hash)
      if (receipt.status === 'SUCCESS') return hash
      if (receipt.status === 'FAILED') {
        const resultMeta = (receipt as any).resultMetaXdr
        throw new Error(`Transaction failed: ${hash} ${resultMeta ? ' (see meta)' : ''}`)
      }
      attempts++
    }
    throw new Error('Transaction timeout')
  }

  // ─── Pool lifecycle ──────────────────────────────────────────

  create(params: CreatePoolParams, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'create', [
      nativeToScVal(params.creator, { type: 'address' }),
      nativeToScVal(BigInt(params.goal), { type: 'i128' }),
      nativeToScVal(params.deadline, { type: 'u64' }),
      nativeToScVal(params.token, { type: 'address' }),
      nativeToScVal(Buffer.from(params.metadata_hash.replace('0x', ''), 'hex'), { type: 'bytes' }),
    ], signer)
  }

  deposit(params: DepositParams, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'deposit', [
      nativeToScVal(params.pool_id, { type: 'u32' }),
      nativeToScVal(params.supporter, { type: 'address' }),
      nativeToScVal(BigInt(params.amount), { type: 'i128' }),
    ], signer)
  }

  submitWork(poolId: number, workHash: string, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'submit_work', [
      nativeToScVal(poolId, { type: 'u32' }),
      nativeToScVal(Buffer.from(workHash.replace('0x', ''), 'hex'), { type: 'bytes' }),
    ], signer)
  }

  vote(params: VoteParams, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'vote', [
      nativeToScVal(params.pool_id, { type: 'u32' }),
      nativeToScVal(params.voter, { type: 'address' }),
      nativeToScVal(params.approve, { type: 'bool' }),
    ], signer)
  }

  finalize(poolId: number, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'finalize', [nativeToScVal(poolId, { type: 'u32' })], signer)
  }

  claimRefund(supporter: string, poolId: number, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'claim_refund', [
      nativeToScVal(supporter, { type: 'address' }),
      nativeToScVal(poolId, { type: 'u32' }),
    ], signer)
  }

  cancelPool(caller: string, poolId: number, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'cancel_pool', [
      nativeToScVal(caller, { type: 'address' }),
      nativeToScVal(poolId, { type: 'u32' }),
    ], signer)
  }

  // ─── Disputes ────────────────────────────────────────────────

  raiseDispute(params: RaiseDisputeParams, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'raise_dispute', [
      nativeToScVal(params.pool_id, { type: 'u32' }),
      nativeToScVal(params.disputant, { type: 'address' }),
      nativeToScVal(params.reason, { type: 'u32' }),
      nativeToScVal(Buffer.from(params.evidence_hash.replace('0x', ''), 'hex'), { type: 'bytes' }),
    ], signer)
  }

  resolveDispute(params: ResolveDisputeParams, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'resolve_dispute', [
      nativeToScVal(params.pool_id, { type: 'u32' }),
      nativeToScVal(params.caller, { type: 'address' }),
      nativeToScVal(params.dispute_id, { type: 'u32' }),
      nativeToScVal(params.vote_for_creator, { type: 'bool' }),
      nativeToScVal(Buffer.from(params.reason_hash.replace('0x', ''), 'hex'), { type: 'bytes' }),
    ], signer)
  }

  closeDispute(poolId: number, disputeId: number, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'close_dispute', [
      nativeToScVal(poolId, { type: 'u32' }),
      nativeToScVal(disputeId, { type: 'u32' }),
    ], signer)
  }

  appealDispute(poolId: number, disputant: string, disputeId: number, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'appeal_dispute', [
      nativeToScVal(poolId, { type: 'u32' }),
      nativeToScVal(disputant, { type: 'address' }),
      nativeToScVal(disputeId, { type: 'u32' }),
    ], signer)
  }

  // ─── Referrals ───────────────────────────────────────────────

  registerReferral(referrer: string, referee: string, poolId: number, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'register_referral', [
      nativeToScVal(referrer, { type: 'address' }),
      nativeToScVal(referee, { type: 'address' }),
      nativeToScVal(poolId, { type: 'u32' }),
    ], signer)
  }

  claimReferralReward(referrer: string, source: string, signer: TxSigner): Promise<string> {
    return this.signAndSend(source, 'claim_referral_reward', [
      nativeToScVal(referrer, { type: 'address' }),
    ], signer)
  }

  // ─── Views (read-only, no signer) ────────────────────────────

  async getPool(poolId: number): Promise<any> {
    const result = await this.server.simulateTransaction(
      new TransactionBuilder(await this.server.getAccount('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'), {
        fee: this.fee,
        networkPassphrase: this.passphrase,
      })
        .addOperation(this.contract.call('get_pool', nativeToScVal(poolId, { type: 'u32' })))
        .setTimeout(300)
        .build(),
    )
    if (!('result' in result) || !result.result) throw new Error('simulation failed')
    return scValToNative(result.result.retval)
  }
}
