import { describe, it, expect, beforeEach } from 'vitest';
import {
  requireOptional,
  requireOptionalMany,
  isPackageAvailable,
  getInstallCommand,
  MissingDependencyError,
  OPTIONAL_DEPENDENCIES,
  clearModuleCache,
} from '../../src/utils/optional-require.js';

describe('Optional Require', () => {
  beforeEach(() => {
    clearModuleCache();
  });

  describe('OPTIONAL_DEPENDENCIES', () => {
    it('should have cardinal dependency info', () => {
      expect(OPTIONAL_DEPENDENCIES['cardinal']).toBeDefined();
      expect(OPTIONAL_DEPENDENCIES['cardinal'].package).toBe('cardinal');
      expect(OPTIONAL_DEPENDENCIES['cardinal'].submodule).toBe('recker/cli');
    });

    it('should have cheerio dependency info', () => {
      expect(OPTIONAL_DEPENDENCIES['cheerio']).toBeDefined();
      expect(OPTIONAL_DEPENDENCIES['cheerio'].package).toBe('cheerio');
      expect(OPTIONAL_DEPENDENCIES['cheerio'].feature).toBe('HTML parsing and scraping');
    });

    it('should have ioredis dependency info', () => {
      expect(OPTIONAL_DEPENDENCIES['ioredis']).toBeDefined();
      expect(OPTIONAL_DEPENDENCIES['ioredis'].package).toBe('ioredis');
    });

    it('should have ssh2-sftp-client dependency info', () => {
      expect(OPTIONAL_DEPENDENCIES['ssh2-sftp-client']).toBeDefined();
    });
  });

  describe('MissingDependencyError', () => {
    it('should create error with correct properties', () => {
      const error = new MissingDependencyError('test-pkg', 'recker/test', 'pnpm add test-pkg');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(MissingDependencyError);
      expect(error.name).toBe('MissingDependencyError');
      expect(error.packageName).toBe('test-pkg');
      expect(error.submodule).toBe('recker/test');
      expect(error.installCommand).toBe('pnpm add test-pkg');
      expect(error.message).toContain('Missing optional dependency: test-pkg');
      expect(error.message).toContain('recker/test');
      expect(error.message).toContain('pnpm add test-pkg');
    });
  });

  describe('requireOptional', () => {
    it('should load installed packages', async () => {
      // zod is a dependency
      const zod = await requireOptional('zod');
      expect(zod).toBeDefined();
    });

    it('should cache loaded modules', async () => {
      const first = await requireOptional('zod');
      const second = await requireOptional('zod');
      expect(first).toBe(second);
    });

    it('should throw MissingDependencyError for missing packages', async () => {
      try {
        await requireOptional('definitely-not-a-real-package-12345', 'recker/test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MissingDependencyError);
        expect((error as MissingDependencyError).packageName).toBe('definitely-not-a-real-package-12345');
      }
    });

    it('should use submodule from registry if not provided', async () => {
      // Clear cache and try to load a known optional dependency that's not installed
      clearModuleCache();
      try {
        await requireOptional('ioredis');
        // If ioredis is installed, this won't throw
      } catch (error) {
        if (error instanceof MissingDependencyError) {
          expect(error.submodule).toBe('recker/cache');
        }
      }
    });
  });

  describe('isPackageAvailable', () => {
    it('should return true for installed packages', () => {
      expect(isPackageAvailable('zod')).toBe(true);
    });

    it('should return false for missing packages', () => {
      expect(isPackageAvailable('definitely-not-installed-xyz-123')).toBe(false);
    });
  });

  describe('getInstallCommand', () => {
    it('should generate install command for single package', () => {
      const cmd = getInstallCommand(['test-package']);
      expect(cmd).toBe('pnpm add test-package');
    });

    it('should generate install command for multiple packages', () => {
      const cmd = getInstallCommand(['pkg1', 'pkg2', 'pkg3']);
      expect(cmd).toBe('pnpm add pkg1 pkg2 pkg3');
    });

    it('should include versions from registry', () => {
      const cmd = getInstallCommand(['cheerio']);
      expect(cmd).toContain('cheerio@');
      expect(cmd).toContain('1.0.0');
    });
  });

  describe('requireOptionalMany', () => {
    it('should load multiple installed packages', async () => {
      const mods = await requireOptionalMany(['zod'], 'test');
      expect(mods['zod']).toBeDefined();
    });

    it('should throw for any missing package', async () => {
      try {
        await requireOptionalMany(['zod', 'fake-package-xyz'], 'test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MissingDependencyError);
        expect((error as MissingDependencyError).packageName).toContain('fake-package-xyz');
      }
    });

    it('should list all missing packages in error', async () => {
      try {
        await requireOptionalMany(['fake-pkg-1', 'fake-pkg-2'], 'test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MissingDependencyError);
        expect((error as MissingDependencyError).packageName).toContain('fake-pkg-1');
        expect((error as MissingDependencyError).packageName).toContain('fake-pkg-2');
      }
    });
  });

  describe('clearModuleCache', () => {
    it('should clear cached modules', async () => {
      // Load a module
      await requireOptional('zod');
      // Clear cache
      clearModuleCache();
      // Module should still be loadable (but from fresh import)
      const mod = await requireOptional('zod');
      expect(mod).toBeDefined();
    });
  });
});
