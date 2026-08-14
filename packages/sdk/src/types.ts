export type PoolStatus = 'open' | 'awaiting_vote' | 'paid' | 'expired' | 'disputed' | 'appealed'

export interface PoolData {
  id: number
  contract_id: string
  creator: string
  token: string
  goal: string
  total_deposited: string
  deadline: number
  status: PoolStatus
  work_hash: string | null
  vote_deadline: number | null
  yes_votes: string
  no_votes: string
  metadata_hash: string
  total_supporters: number
  created_at: number
  updated_at: number
}

export interface SupporterData {
  id: number
  pool_id: number
  address: string
  amount: string
  voted: boolean
  created_at: number
}

export interface EventData {
  id: number
  pool_id: number
  event_type: string
  data: string
  ledger: number
  ts: number
}

export interface DisputeData {
  id: number
  pool_id: number
  raised_by: string
  reason: number
  evidence_hash: string
  fee: string
  status: number
  created_at: number
  resolved_at: number
  appeal_count: number
}

export interface ArbitratorVoteData {
  arbitrator: string
  vote_for_creator: boolean
  weight: string
  reason_hash: string
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  limit: number
  total: number
  total_pages: number
}

export interface PoolListParams {
  status?: PoolStatus
  creator?: string
  sort?: 'newest' | 'ending_soon' | 'most_funded'
  page?: number
  limit?: number
}

export interface CreatePoolParams {
  creator: string
  goal: number | bigint
  deadline: number
  token: string
  metadata_hash: string // hex-encoded bytes (without 0x prefix)
}

export interface DepositParams {
  pool_id: number
  supporter: string
  amount: number | bigint
}

export interface VoteParams {
  pool_id: number
  voter: string
  approve: boolean
}
