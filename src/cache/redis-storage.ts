import { CacheStorage, CacheEntry } from '../types/index.js';

// Duck-typing interface for Redis client (ioredis/node-redis)
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<any>;
  del(key: string): Promise<any>;
}

export class RedisStorage implements CacheStorage {
  constructor(private redis: RedisClient, private prefix: string = 'recker:') {}

  async get(key: string): Promise<CacheEntry | undefined | null> {
    const data = await this.redis.get(this.prefix + key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async set(key: string, value: CacheEntry, ttl: number): Promise<void> {
    // TTL in milliseconds. Redis usually takes seconds (EX) or millis (PX).
    // Assuming ioredis/modern redis supports PX.
    await this.redis.set(this.prefix + key, JSON.stringify(value), 'PX', ttl);
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}
