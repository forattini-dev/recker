/**
 * Lazy loader for embeddings data.
 *
 * Downloads embeddings from GitHub Releases only when needed,
 * caching them locally for subsequent uses.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { EmbeddingsData } from './search/types.js';
import { DownloadError } from '../core/errors.js';

// Get package version dynamically
function getPackageVersionFromPkg(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));

    // Try different paths to find package.json
    const paths = [
      join(__dirname, '..', '..', 'package.json'),
      join(__dirname, '..', '..', '..', 'package.json'),
      join(process.cwd(), 'package.json'),
    ];

    for (const pkgPath of paths) {
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'recker') {
          return pkg.version;
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return '1.0.15'; // Fallback version
}

// Package version - used to match embeddings version (lazy loaded)
let _packageVersion: string | null = null;
function getPackageVersion(): string {
  if (!_packageVersion) {
    _packageVersion = getPackageVersionFromPkg();
  }
  return _packageVersion;
}

// GitHub Release URL pattern
const GITHUB_RELEASE_URL = 'https://github.com/forattini-dev/recker/releases/download';

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
 * Get the path where embeddings should be cached.
 */
export function getEmbeddingsCachePath(version?: string): string {
  const cacheDir = getCacheDir();
  const ver = version || getPackageVersion();
  return join(cacheDir, `embeddings-${ver}.json`);
}

/**
 * Check if embeddings are cached locally.
 */
export function hasLocalEmbeddings(version?: string): boolean {
  return existsSync(getEmbeddingsCachePath(version));
}

/**
 * Load embeddings from local cache.
 */
export function loadLocalEmbeddings(version?: string): EmbeddingsData | null {
  const cachePath = getEmbeddingsCachePath(version);

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const data = readFileSync(cachePath, 'utf-8');
    return JSON.parse(data) as EmbeddingsData;
  } catch {
    return null;
  }
}

/**
 * Save embeddings to local cache.
 */
export function saveLocalEmbeddings(data: EmbeddingsData, version?: string): void {
  const cachePath = getEmbeddingsCachePath(version);
  const cacheDir = dirname(cachePath);

  // Ensure cache directory exists
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  writeFileSync(cachePath, JSON.stringify(data));
}

/**
 * Download embeddings from GitHub Releases.
 */
export async function downloadEmbeddings(version?: string): Promise<EmbeddingsData> {
  const ver = version || getPackageVersion();
  const url = `${GITHUB_RELEASE_URL}/v${ver}/embeddings.json`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new DownloadError(`Failed to download embeddings: ${response.status} ${response.statusText}`, {
        url,
        statusCode: response.status,
        retriable: response.status >= 500,
      });
    }

    const data = await response.json() as EmbeddingsData;

    // Cache locally for future use
    saveLocalEmbeddings(data, ver);

    return data;
  } catch (error) {
    if (error instanceof DownloadError) throw error;
    throw new DownloadError(`Failed to download embeddings from ${url}: ${error}`, {
      url,
      retriable: true,
    });
  }
}

/**
 * Try to load embeddings from bundled file (for development).
 */
export async function loadBundledEmbeddings(): Promise<EmbeddingsData | null> {
  try {
    // Try the bundled file path
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const bundledPath = join(__dirname, 'data', 'embeddings.json');

    if (existsSync(bundledPath)) {
      const data = readFileSync(bundledPath, 'utf-8');
      return JSON.parse(data) as EmbeddingsData;
    }

    // Try relative to source
    const srcPath = join(__dirname, '..', 'mcp', 'data', 'embeddings.json');
    if (existsSync(srcPath)) {
      const data = readFileSync(srcPath, 'utf-8');
      return JSON.parse(data) as EmbeddingsData;
    }
  } catch {
    // Not available
  }

  return null;
}

export interface LoadEmbeddingsOptions {
  /** Force download even if cached */
  forceDownload?: boolean;
  /** Specific version to load */
  version?: string;
  /** Skip network download (offline mode) */
  offline?: boolean;
  /** Debug logging */
  debug?: boolean;
}

/**
 * Load embeddings with lazy download strategy.
 *
 * Priority:
 * 1. Local cache (fast, no network)
 * 2. Bundled file (development mode)
 * 3. GitHub Release download (first time or update)
 *
 * @example
 * ```ts
 * // Load embeddings (downloads if needed)
 * const embeddings = await loadEmbeddings();
 *
 * // Force re-download
 * const fresh = await loadEmbeddings({ forceDownload: true });
 *
 * // Offline mode (only use cache)
 * const cached = await loadEmbeddings({ offline: true });
 * ```
 */
export async function loadEmbeddings(options: LoadEmbeddingsOptions = {}): Promise<EmbeddingsData | null> {
  const { forceDownload = false, version, offline = false, debug = false } = options;

  const log = (msg: string) => {
    if (debug) console.log(`[embeddings-loader] ${msg}`);
  };

  // 1. Check local cache first (unless forcing download)
  if (!forceDownload) {
    const cached = loadLocalEmbeddings(version);
    if (cached) {
      log(`Loaded from cache: ${getEmbeddingsCachePath(version)}`);
      return cached;
    }
  }

  // 2. Try bundled file (for development/testing)
  const bundled = await loadBundledEmbeddings();
  if (bundled) {
    log('Loaded bundled embeddings');
    return bundled;
  }

  // 3. Download from GitHub Releases (if online)
  if (!offline) {
    try {
      log(`Downloading embeddings v${version || getPackageVersion()}...`);
      const downloaded = await downloadEmbeddings(version);
      log(`Downloaded and cached: ${downloaded.documents?.length || 0} documents`);
      return downloaded;
    } catch (error) {
      log(`Download failed: ${error}`);
      // Don't throw, return null to allow graceful degradation
    }
  }

  log('No embeddings available');
  return null;
}

/**
 * Clear cached embeddings.
 */
export function clearEmbeddingsCache(version?: string): void {
  const cachePath = getEmbeddingsCachePath(version);

  try {
    const fs = require('fs');
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Get the current package version (exported for external use).
 */
export { getPackageVersion };
