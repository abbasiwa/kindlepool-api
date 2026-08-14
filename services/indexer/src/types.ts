export type PoolStatus = 'open' | 'awaiting_vote' | 'paid' | 'expired' | 'disputed' | 'appealed' | 'cancelled'

export interface PoolRow {
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

export interface SupporterRow {
  id: number
  pool_id: number
  address: string
  amount: string
  voted: boolean
  created_at: number
}

export interface EventRow {
  id: number
  pool_id: number
  event_type: string
  data: string
  ledger: number
  ts: number
  created_at: number
}

export interface PoolListQuery {
  status?: PoolStatus
  creator?: string
  supporter?: string
  sort?: 'newest' | 'ending_soon' | 'most_funded'
  page?: number
  limit?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  limit: number
  total: number
  total_pages: number
}
