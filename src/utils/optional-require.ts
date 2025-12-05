/**
 * Optional Require Helper
 *
 * Provides dynamic imports for optional dependencies with friendly error messages.
 * This allows sub-modules to be truly optional - users only need to install
 * the dependencies for the features they actually use.
 *
 * @example
 * ```typescript
 * const cheerio = await requireOptional('cheerio', 'recker/scrape');
 * ```
 */

/**
 * Metadata for optional dependencies
 */
interface DependencyInfo {
  /** npm package name */
  package: string;
  /** Sub-module that requires it */
  submodule: string;
  /** Minimum version (for display) */
  version?: string;
  /** What feature it enables */
  feature?: string;
}

/**
 * Registry of optional dependencies
 */
export const OPTIONAL_DEPENDENCIES: Record<string, DependencyInfo> = {
  // CLI (optional enhancement)
  'cardinal': {
    package: 'cardinal',
    submodule: 'recker/cli',
    version: '^2.0.0',
    feature: 'syntax highlighting',
  },

  // Protocols
  'ssh2-sftp-client': {
    package: 'ssh2-sftp-client',
    submodule: 'recker/protocols/sftp',
    version: '^11.0.0',
    feature: 'SFTP client',
  },

  // Scraping
  'cheerio': {
    package: 'cheerio',
    submodule: 'recker/scrape',
    version: '^1.0.0',
    feature: 'HTML parsing and scraping',
  },

  // Cache
  'ioredis': {
    package: 'ioredis',
    submodule: 'recker/cache',
    version: '^5.0.0',
    feature: 'Redis cache storage',
  },
};

/**
 * Error thrown when an optional dependency is not installed
 */
export class MissingDependencyError extends Error {
  constructor(
    public readonly packageName: string,
    public readonly submodule: string,
    public readonly installCommand: string
  ) {
    super(
      `Missing optional dependency: ${packageName}\n\n` +
      `This dependency is required for ${submodule}.\n` +
      `Install it with:\n\n  ${installCommand}\n`
    );
    this.name = 'MissingDependencyError';
  }
}

/**
 * Cache for already-loaded modules
 */
const moduleCache = new Map<string, unknown>();

/**
 * Clear the module cache (for testing purposes)
 * @internal
 */
export function clearModuleCache(): void {
  moduleCache.clear();
}

/**
 * Dynamically import an optional dependency
 *
 * @param packageName - The npm package name
 * @param submodule - The recker submodule requiring it (for error messages)
 * @returns The imported module
 * @throws MissingDependencyError if the package is not installed
 *
 * @example
 * ```typescript
 * // In src/scrape/index.ts
 * const cheerio = await requireOptional<typeof import('cheerio')>('cheerio', 'recker/scrape');
 * const $ = cheerio.load(html);
 * ```
 */
export async function requireOptional<T = unknown>(
  packageName: string,
  submodule?: string
): Promise<T> {
  // Check cache first
  if (moduleCache.has(packageName)) {
    return moduleCache.get(packageName) as T;
  }

  try {
    const mod = await import(packageName);
    moduleCache.set(packageName, mod);
    return mod as T;
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    // Check for various module not found error patterns
    const isModuleNotFound =
      err.code === 'ERR_MODULE_NOT_FOUND' ||
      err.code === 'MODULE_NOT_FOUND' ||
      (err.message?.includes('Cannot find module'));

    if (isModuleNotFound) {
      const info = OPTIONAL_DEPENDENCIES[packageName];
      const sub = submodule || info?.submodule || 'this feature';
      const version = info?.version || '';
      const pkg = version ? `${packageName}@${version.replace('^', '')}` : packageName;

      throw new MissingDependencyError(
        packageName,
        sub,
        `pnpm add ${pkg}`
      );
    }
    throw error;
  }
}

/**
 * Synchronous version - checks if a package is available without importing
 *
 * @param packageName - The npm package name
 * @returns true if the package is available
 */
export function isPackageAvailable(packageName: string): boolean {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get install command for multiple packages
 *
 * @param packages - Array of package names
 * @returns Install command string
 */
export function getInstallCommand(packages: string[]): string {
  const pkgsWithVersions = packages.map((pkg) => {
    const info = OPTIONAL_DEPENDENCIES[pkg];
    return info?.version ? `${pkg}@${info.version.replace('^', '')}` : pkg;
  });
  return `pnpm add ${pkgsWithVersions.join(' ')}`;
}

/**
 * Helper to require multiple optional dependencies at once
 *
 * @param packages - Array of package names
 * @param submodule - The submodule requiring them
 * @returns Object with all imported modules
 *
 * @example
 * ```typescript
 * const { commander, picocolors, ora } = await requireOptionalMany(
 *   ['commander', 'picocolors', 'ora'],
 *   'recker/cli'
 * );
 * ```
 */
export async function requireOptionalMany<T extends Record<string, unknown>>(
  packages: string[],
  submodule: string
): Promise<T> {
  const missing: string[] = [];
  const results: Record<string, unknown> = {};

  for (const pkg of packages) {
    try {
      results[pkg] = await requireOptional(pkg, submodule);
    } catch (error) {
      if (error instanceof MissingDependencyError) {
        missing.push(pkg);
      } else {
        throw error;
      }
    }
  }

  if (missing.length > 0) {
    throw new MissingDependencyError(
      missing.join(', '),
      submodule,
      getInstallCommand(missing)
    );
  }

  return results as T;
}
