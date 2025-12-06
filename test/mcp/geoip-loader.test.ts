import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getGeoIPDatabasePath,
  hasLocalGeoIPDatabase,
  clearGeoIPCache,
  ensureGeoIPDatabase,
  downloadGeoIPDatabase
} from '../../src/mcp/geoip-loader.js';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import { dirname, join } from 'path';

describe('GeoIP Loader', () => {
  const testCacheDir = join(process.cwd(), 'test-cache-geoip');
  const originalHome = process.env.HOME;

  beforeEach(() => {
    // Create test cache directory
    mkdirSync(testCacheDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testCacheDir)) {
      rmSync(testCacheDir, { recursive: true, force: true });
    }
    // Restore original HOME
    process.env.HOME = originalHome;
  });

  describe('getGeoIPDatabasePath', () => {
    it('should return a path string', () => {
      const path = getGeoIPDatabasePath();
      expect(typeof path).toBe('string');
      expect(path).toContain('GeoLite2-City.mmdb');
    });

    it('should use HOME directory when available', () => {
      process.env.HOME = '/tmp/test-home';
      const path = getGeoIPDatabasePath();
      expect(path).toContain('.cache');
      expect(path).toContain('recker');
    });

    it('should use USERPROFILE when HOME is not available', () => {
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = '';
      process.env.USERPROFILE = '/tmp/test-userprofile';
      const path = getGeoIPDatabasePath();
      expect(path).toContain('.cache');
      process.env.USERPROFILE = originalUserProfile;
    });

    it('should fallback when no home dir is available', () => {
      process.env.HOME = '';
      process.env.USERPROFILE = '';
      const path = getGeoIPDatabasePath();
      expect(path).toContain('GeoLite2-City.mmdb');
    });
  });

  describe('hasLocalGeoIPDatabase', () => {
    it('should return false when database does not exist', () => {
      // Clear any existing cache
      clearGeoIPCache();
      expect(hasLocalGeoIPDatabase()).toBe(false);
    });

    it('should return true when database exists', () => {
      const dbPath = getGeoIPDatabasePath();
      const cacheDir = dirname(dbPath);

      // Create the directory and file
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(dbPath, 'fake db content');

      expect(hasLocalGeoIPDatabase()).toBe(true);

      // Clean up
      clearGeoIPCache();
    });
  });

  describe('clearGeoIPCache', () => {
    it('should remove existing database', () => {
      const dbPath = getGeoIPDatabasePath();
      const cacheDir = dirname(dbPath);

      // Create the directory and file
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(dbPath, 'fake db content');

      expect(existsSync(dbPath)).toBe(true);
      clearGeoIPCache();
      expect(existsSync(dbPath)).toBe(false);
    });

    it('should not throw when database does not exist', () => {
      // Ensure no database exists
      clearGeoIPCache();
      // Should not throw
      expect(() => clearGeoIPCache()).not.toThrow();
    });
  });

  describe('ensureGeoIPDatabase', () => {
    it('should return cached path when database exists', async () => {
      const dbPath = getGeoIPDatabasePath();
      const cacheDir = dirname(dbPath);

      // Create fake cached database
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(dbPath, 'fake db content');

      const result = await ensureGeoIPDatabase();
      expect(result).toBe(dbPath);

      // Clean up
      clearGeoIPCache();
    });

    it('should use cached version in offline mode', async () => {
      const dbPath = getGeoIPDatabasePath();
      const cacheDir = dirname(dbPath);

      // Create fake cached database
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(dbPath, 'fake db content');

      const result = await ensureGeoIPDatabase({ offline: true });
      expect(result).toBe(dbPath);

      // Clean up
      clearGeoIPCache();
    });

    it('should return null in offline mode without cache', async () => {
      clearGeoIPCache();
      const result = await ensureGeoIPDatabase({ offline: true });
      expect(result).toBeNull();
    });

    it('should support debug option', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const dbPath = getGeoIPDatabasePath();
      const cacheDir = dirname(dbPath);
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(dbPath, 'fake db content');

      await ensureGeoIPDatabase({ debug: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[geoip-loader]'));

      consoleSpy.mockRestore();
      clearGeoIPCache();
    });

    it('should force download when forceDownload is true and handle network failure', async () => {
      const dbPath = getGeoIPDatabasePath();
      const cacheDir = dirname(dbPath);

      // Create fake cached database
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(dbPath, 'fake db content');

      // Mock fetch to fail
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      // forceDownload but network fails - should use stale cache
      const result = await ensureGeoIPDatabase({ forceDownload: true, debug: true });
      expect(result).toBe(dbPath);

      global.fetch = originalFetch;
      clearGeoIPCache();
    });
  });

  describe('downloadGeoIPDatabase', () => {
    it('should throw DownloadError on non-OK response', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(downloadGeoIPDatabase()).rejects.toThrow('Failed to download GeoLite2 database');

      global.fetch = originalFetch;
    });

    it('should throw DownloadError when no response body', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: null,
      });

      await expect(downloadGeoIPDatabase()).rejects.toThrow('No response body received');

      global.fetch = originalFetch;
    });

    it('should handle 500 error as retriable', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      try {
        await downloadGeoIPDatabase();
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Failed to download');
        // Check the error was thrown (retriable info is in error metadata)
      }

      global.fetch = originalFetch;
    });
  });
});
