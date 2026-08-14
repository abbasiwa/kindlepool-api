import type { PoolData, SupporterData, EventData, PaginatedResponse, PoolListParams } from './types'

const DEFAULT_BASE_URL = 'https://kindlepool-api.herokuapp.com'

export class KindlePoolAPI {
  private baseUrl: string
  private apiKey?: string

  constructor(options?: { baseUrl?: string; apiKey?: string }) {
    const envUrl = typeof process !== 'undefined' && process.env?.KINDPOOL_API_URL ? process.env.KINDPOOL_API_URL : undefined
    this.baseUrl = options?.baseUrl ?? envUrl ?? DEFAULT_BASE_URL
    this.apiKey = options?.apiKey
  }

  private get headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) h['X-API-Key'] = this.apiKey
    return h
  }

  // All indexer endpoints live under /api/v1 (audit #10).
  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, { ...init, headers: { ...this.headers, ...init?.headers } })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`KindlePool API ${res.status}: ${body}`)
    }
    return res.json()
  }

  async listPools(params?: PoolListParams): Promise<PaginatedResponse<PoolData>> {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.creator) q.set('creator', params.creator)
    if (params?.sort) q.set('sort', params.sort)
    if (params?.page) q.set('page', String(params.page))
    if (params?.limit) q.set('limit', String(params.limit))
    return this.fetch(`/pools?${q.toString()}`)
  }

  async getPool(id: number): Promise<PoolData> {
    return this.fetch(`/pools/${id}`)
  }

  async getPoolSupporters(poolId: number): Promise<{ data: SupporterData[] }> {
    return this.fetch(`/pools/${poolId}/supporters`)
  }

  async getPoolEvents(poolId: number, limit?: number): Promise<{ data: EventData[] }> {
    const q = limit ? `?limit=${limit}` : ''
    return this.fetch(`/pools/${poolId}/events${q}`)
  }

  async getPoolsBySupporter(address: string): Promise<{ data: PoolData[] }> {
    return this.fetch(`/supporters/${address}/pools`)
  }

  async getPoolsByCreator(address: string): Promise<{ data: PoolData[] }> {
    return this.fetch(`/creators/${address}/pools`)
  }

  async getEvents(params?: { type?: string; limit?: number }): Promise<{ data: EventData[] }> {
    const q = new URLSearchParams()
    if (params?.type) q.set('type', params.type)
    if (params?.limit) q.set('limit', String(params.limit))
    return this.fetch(`/events?${q.toString()}`)
  }

  async health(): Promise<{ status: string; timestamp: number }> {
    return this.fetch('/health')
  }
}
