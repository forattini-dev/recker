import { promises as fs, existsSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { CacheStorage, CacheEntry } from '../types/index.js';

export interface FileSystemStorageOptions {
  /**
   * Path to the cache directory.
   * Defaults to a subdirectory in the OS's temporary directory (e.g., /tmp/recker-cache)
   */
  path?: string;
  /**
   * Default TTL in milliseconds (used if not specified in set() or CacheEntry)
   * @default 300000 (5 minutes)
   */
  ttl?: number;
  /**
   * Interval in ms to clean up expired items
   * Set to 0 to disable (only lazy expiration on get)
   * @default 60000 (1 minute)
   */
  cleanupInterval?: number;
  /**
   * Maximum number of items to store. 0 for unlimited.
   * @default 0
   */
  maxSize?: number;
}

/**
 * FileSystemCache implementation for CacheStorage.
 * Stores cache entries as files on the filesystem.
 * TTL is enforced by checking file modification time and CacheEntry.expires.
 */
export class FileSystemStorage implements CacheStorage {
  private cacheDir: string;
  private defaultTtl: number;
  private cleanupInterval: number;
  private maxSize: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: FileSystemStorageOptions = {}) {
    this.cacheDir = options.path || join(tmpdir(), 'recker-cache');
    this.defaultTtl = options.ttl ?? 300000;
    this.cleanupInterval = options.cleanupInterval ?? 60000;
    this.maxSize = options.maxSize ?? 0;

    this.initCacheDir();
    if (this.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => this.cleanupExpired(), this.cleanupInterval);
      this.cleanupTimer.unref(); // Allow Node.js process to exit if this is the only timer
    }
  }

  private initCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getFilePath(key: string): string {
    // Simple hashing to avoid invalid file names and keep directory clean
    // A more robust solution might use a proper hash function or escape characters
    const safeKey = Buffer.from(key).toString('base64url');
    return join(this.cacheDir, safeKey + '.json');
  }

  private async isExpired(filePath: string, entry: CacheEntry): Promise<boolean> {
    const now = Date.now();
    
    // Check entry's internal expires timestamp first
    if (entry.expires && now > entry.expires) {
      return true;
    }

    // Fallback to file's mtime if entry.expires is not present or too far in future
    // and compare with defaultTtl
    try {
      const stats = await fs.stat(filePath);
      const fileAge = now - stats.mtimeMs;
      if (fileAge > (entry.maxAge ? entry.maxAge * 1000 : this.defaultTtl)) {
        return true;
      }
    } catch (error: any) {
      // If file doesn't exist, it's considered expired (or never existed)
      if (error.code === 'ENOENT') {
        return true;
      }
      throw error; // Re-throw other errors
    }
    return false;
  }

  async get(key: string): Promise<CacheEntry | undefined | null> {
    const filePath = this.getFilePath(key);
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      const entry: CacheEntry = JSON.parse(fileContent);

      if (await this.isExpired(filePath, entry)) {
        await this.delete(key); // Clean up expired file
        return undefined;
      }
      return entry;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File not found
        return undefined;
      } else if (error instanceof SyntaxError) {
        // Corrupted JSON - delete the file
        await this.delete(key); 
        return undefined;
      }
      throw error;
    }
  }

  async set(key: string, value: CacheEntry, ttl?: number): Promise<void> {
    const filePath = this.getFilePath(key);
    const effectiveTtl = ttl ?? this.defaultTtl;
    const now = Date.now();

    // Ensure expires is set based on effectiveTtl if not already present or invalid
    if (!value.expires || value.expires < now) {
      value.expires = now + effectiveTtl;
    }

    const fileContent = JSON.stringify(value);

    try {
      await fs.writeFile(filePath, fileContent, 'utf8');
      if (this.maxSize > 0) {
        await this.enforceMaxSize();
      }
    } catch (error) {
      console.error(`Error writing cache file ${filePath}:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    try {
      await fs.unlink(filePath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        // Ignore file not found errors
        console.error(`Error deleting cache file ${filePath}:`, error);
      }
    }
  }

  async clear(prefix?: string): Promise<void> {
    const files = await fs.readdir(this.cacheDir);
    for (const file of files) {
      const filePath = join(this.cacheDir, file);
      const key = Buffer.from(file.replace(/\.json$/, ''), 'base64url').toString('utf8');
      if (!prefix || key.startsWith(prefix)) {
        try {
          await fs.unlink(filePath);
        } catch (error: any) {
          console.error(`Error clearing cache file ${filePath}:`, error);
        }
      }
    }
  }

  async size(): Promise<number> {
    const files = await fs.readdir(this.cacheDir);
    return files.length;
  }

  async keys(): Promise<string[]> {
    const files = await fs.readdir(this.cacheDir);
    const keys: string[] = [];
    for (const file of files) {
      keys.push(Buffer.from(file.replace(/\.json$/, ''), 'base64url').toString('utf8'));
    }
    return keys;
  }

  /**
   * Periodically clean up expired cache files.
   * Also enforces maxSize if configured.
   */
  private async cleanupExpired(): Promise<void> {
    const files = await fs.readdir(this.cacheDir);
    const now = Date.now();
    const candidates: { path: string; entry: CacheEntry; mtimeMs: number }[] = [];

    for (const file of files) {
      const filePath = join(this.cacheDir, file);
      try {
        const stats = await fs.stat(filePath);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const entry: CacheEntry = JSON.parse(fileContent);

        if (entry.expires && now > entry.expires) {
          await fs.unlink(filePath);
          continue;
        }
        
        // If no explicit expires, use defaultTtl based on file mtime
        if (!entry.expires && (now - stats.mtimeMs) > this.defaultTtl) {
             await fs.unlink(filePath);
             continue;
        }

        candidates.push({ path: filePath, entry, mtimeMs: stats.mtimeMs });
      } catch (error: any) {
        // Ignore files that are not valid JSON or can't be read/stated
        if (error.code !== 'ENOENT' && error instanceof SyntaxError) {
             console.error(`Warning: Corrupted cache file ${filePath}, deleting...`, error);
        }
        await fs.unlink(filePath).catch(() => {}); // Attempt to delete corrupted file
      }
    }
    if (this.maxSize > 0) {
        await this.enforceMaxSize();
    }
  }

  /**
   * Enforces the maximum number of items in the cache.
   * Evicts the oldest items (based on mtimeMs) until maxSize is met.
   */
  private async enforceMaxSize(): Promise<void> {
    if (this.maxSize <= 0) return;

    let files = await fs.readdir(this.cacheDir);
    if (files.length <= this.maxSize) return;

    // Get file stats with modification times
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = join(this.cacheDir, file);
        try {
          const stats = await fs.stat(filePath);
          return { path: filePath, mtimeMs: stats.mtimeMs };
        } catch {
          return null;
        }
      })
    );

    const validFiles = fileStats.filter(s => s !== null) as { path: string; mtimeMs: number }[];

    // Sort by modification time (oldest first)
    validFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

    // Remove oldest files until size limit is met
    while (validFiles.length > this.maxSize) {
      const oldestFile = validFiles.shift(); // Get and remove the oldest file
      if (oldestFile) {
        try {
          await fs.unlink(oldestFile.path);
        } catch (error: any) {
          console.error(`Error enforcing maxSize for file ${oldestFile.path}:`, error);
        }
      }
    }
  }

  /**
   * Shut down the cache, clearing any active timers.
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
