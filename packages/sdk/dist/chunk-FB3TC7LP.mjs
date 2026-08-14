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

export {
  KindlePoolAPI
};
