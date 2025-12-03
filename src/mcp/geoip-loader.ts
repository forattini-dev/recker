/**
 * Lazy loader for MaxMind GeoLite2 database.
 *
 * Downloads the GeoLite2-City database from CDN when needed,
 * caching it locally for subsequent uses.
 *
 * Data source: wp-statistics/GeoLite2-City (redistributed under CC BY-SA 4.0)
 * Updates: Twice per month
 */

import { existsSync, mkdirSync, createWriteStream, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { DownloadError } from '../core/errors.js';

// CDN URL for GeoLite2-City database (redistributed, no license key needed)
const GEOLITE2_CDN_URL = 'https://cdn.jsdelivr.net/npm/geolite2-city/GeoLite2-City.mmdb.gz';

// Database filename
const DB_FILENAME = 'GeoLite2-City.mmdb';

// Cache directory (user's cache or node_modules cache)
function getCacheDir(): string {
  // Try user cache first
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (homeDir) {
    return join(homeDir, '.cache', 'recker');
  }

  // Fallback to node_modules cache
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    return join(__dirname, '..', '..', 'node_modules', '.cache', 'recker');
  } catch {
    return join(process.cwd(), 'node_modules', '.cache', 'recker');
  }
}

/**
 * Get the path where GeoLite2 database should be cached.
 */
export function getGeoIPDatabasePath(): string {
  const cacheDir = getCacheDir();
  return join(cacheDir, DB_FILENAME);
}

/**
 * Check if GeoLite2 database is cached locally.
 */
export function hasLocalGeoIPDatabase(): boolean {
  return existsSync(getGeoIPDatabasePath());
}

/**
 * Download GeoLite2 database from CDN.
 */
export async function downloadGeoIPDatabase(): Promise<string> {
  const dbPath = getGeoIPDatabasePath();
  const cacheDir = dirname(dbPath);

  // Ensure cache directory exists
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  try {
    const response = await fetch(GEOLITE2_CDN_URL);

    if (!response.ok) {
      throw new DownloadError(`Failed to download GeoLite2 database: ${response.status} ${response.statusText}`, {
        url: GEOLITE2_CDN_URL,
        statusCode: response.status,
        retriable: response.status >= 500,
      });
    }

    if (!response.body) {
      throw new DownloadError('No response body received', {
        url: GEOLITE2_CDN_URL,
        retriable: true,
      });
    }

    // Stream download and decompress gzip
    const tempPath = dbPath + '.tmp';
    const gunzip = createGunzip();
    const writeStream = createWriteStream(tempPath);

    // Convert Web ReadableStream to Node.js stream
    const nodeStream = Readable.fromWeb(response.body as any);

    await pipeline(nodeStream, gunzip, writeStream);

    // Rename temp file to final path (atomic operation)
    const fs = await import('fs/promises');
    await fs.rename(tempPath, dbPath);

    return dbPath;
  } catch (error) {
    if (error instanceof DownloadError) throw error;
    throw new DownloadError(`Failed to download GeoLite2 database: ${error}`, {
      url: GEOLITE2_CDN_URL,
      retriable: true,
    });
  }
}

export interface LoadGeoIPOptions {
  /** Force download even if cached */
  forceDownload?: boolean;
  /** Skip network download (offline mode) */
  offline?: boolean;
  /** Debug logging */
  debug?: boolean;
}

/**
 * Ensure GeoLite2 database is available locally.
 *
 * Priority:
 * 1. Local cache (fast, no network)
 * 2. CDN download (first time or update)
 *
 * @returns Path to the database file, or null if unavailable
 *
 * @example
 * ```ts
 * // Ensure database is available (downloads if needed)
 * const dbPath = await ensureGeoIPDatabase();
 *
 * // Force re-download
 * const fresh = await ensureGeoIPDatabase({ forceDownload: true });
 *
 * // Offline mode (only use cache)
 * const cached = await ensureGeoIPDatabase({ offline: true });
 * ```
 */
export async function ensureGeoIPDatabase(options: LoadGeoIPOptions = {}): Promise<string | null> {
  const { forceDownload = false, offline = false, debug = false } = options;

  const log = (msg: string) => {
    if (debug) console.log(`[geoip-loader] ${msg}`);
  };

  const dbPath = getGeoIPDatabasePath();

  // 1. Check local cache first (unless forcing download)
  if (!forceDownload && hasLocalGeoIPDatabase()) {
    log(`Using cached database: ${dbPath}`);
    return dbPath;
  }

  // 2. Download from CDN (if online)
  if (!offline) {
    try {
      log('Downloading GeoLite2-City database...');
      const downloaded = await downloadGeoIPDatabase();
      log(`Downloaded and cached: ${downloaded}`);
      return downloaded;
    } catch (error) {
      log(`Download failed: ${error}`);
      // Don't throw, return null to allow graceful degradation
    }
  }

  // 3. Check if we have a cached version after failed download
  if (hasLocalGeoIPDatabase()) {
    log(`Using stale cached database: ${dbPath}`);
    return dbPath;
  }

  log('No GeoIP database available');
  return null;
}

/**
 * Clear cached GeoIP database.
 */
export function clearGeoIPCache(): void {
  const dbPath = getGeoIPDatabasePath();

  try {
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
  } catch {
    // Ignore errors
  }
}
