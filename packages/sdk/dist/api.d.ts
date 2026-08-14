import { PoolListParams, PaginatedResponse, PoolData, SupporterData, EventData } from './types.js';

declare class KindlePoolAPI {
    private baseUrl;
    private apiKey?;
    constructor(options?: {
        baseUrl?: string;
        apiKey?: string;
    });
    private get headers();
    private fetch;
    listPools(params?: PoolListParams): Promise<PaginatedResponse<PoolData>>;
    getPool(id: number): Promise<PoolData>;
    getPoolSupporters(poolId: number): Promise<{
        data: SupporterData[];
    }>;
    getPoolEvents(poolId: number, limit?: number): Promise<{
        data: EventData[];
    }>;
    getPoolsBySupporter(address: string): Promise<{
        data: PoolData[];
    }>;
    getPoolsByCreator(address: string): Promise<{
        data: PoolData[];
    }>;
    getEvents(params?: {
        type?: string;
        limit?: number;
    }): Promise<{
        data: EventData[];
    }>;
    health(): Promise<{
        status: string;
        timestamp: number;
    }>;
}

export { KindlePoolAPI };
