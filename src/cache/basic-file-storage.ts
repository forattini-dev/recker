import { CacheEntry, CacheStorage } from '../types/index.js';
import { mkdir, readFile, writeFile, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

export class FileStorage implements CacheStorage {
  private dir: string;

  constructor(baseDir: string = '.recker/cache') {
    this.dir = baseDir;
  }

  private getHash(key: string): string {
    return createHash('md5').update(key).digest('hex');
  }

  private getPath(key: string): string {
    return join(this.dir, `${this.getHash(key)}.json`);
  }

  private async ensureDir() {
    if (!existsSync(this.dir)) {
      await mkdir(this.dir, { recursive: true });
    }
  }

  async get(key: string): Promise<CacheEntry | undefined> {
    try {
      const path = this.getPath(key);
      if (!existsSync(path)) return undefined;

      const content = await readFile(path, 'utf-8');
      const data = JSON.parse(content);

      // Check TTL stored in the file wrapper if we handled it there, 
      // but CacheEntry doesn't strictly assume storage handles TTL expiry logic 
      // internally unless we wrap it. 
      // The Cache Plugin handles TTL checking logic via timestamp.
      // However, for file storage, we might want to clean up old files eventually.
      // For now, we purely act as storage.
      
      return data as CacheEntry;
    } catch (error) {
      return undefined;
    }
  }

  async set(key: string, entry: CacheEntry, ttl?: number): Promise<void> {
    await this.ensureDir();
    const path = this.getPath(key);
    // We store the entry as JSON. 
    await writeFile(path, JSON.stringify(entry), 'utf-8');
  }

  async delete(key: string): Promise<void> {
    const path = this.getPath(key);
    if (existsSync(path)) {
      await unlink(path);
    }
  }

  async clear(): Promise<void> {
    if (existsSync(this.dir)) {
        await rm(this.dir, { recursive: true, force: true });
    }
  }
}
