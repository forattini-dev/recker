/**
 * Centralized Mitata Configuration
 *
 * Provides optimized benchmark settings for consistent, statistically
 * reliable results across all benchmark files.
 *
 * Key configurations:
 * - min_samples: Minimum samples before stopping (higher = more accurate)
 * - min_cpu_time: Minimum CPU time in nanoseconds (higher = more stable)
 * - warmup_samples: Number of warmup runs (higher = better JIT optimization)
 * - batch_samples: Samples per batch for micro-benchmarks
 *
 * V8 JIT Optimization:
 * - Ignition (interpreter) → first executions
 * - Sparkplug (baseline) → after ~6 calls
 * - TurboFan (optimizing JIT) → after function becomes "hot" (~1000 calls)
 * - Inline Caching → stabilizes after seeing types multiple times
 *
 * We add explicit warmup to ensure TurboFan compiles all code paths.
 */

import { run as mitataRun } from 'mitata';

/**
 * Default mitata run options optimized for HTTP client benchmarks
 */
export interface BenchRunOptions {
  /** Show average time */
  avg?: boolean;
  /** Show min/max values */
  min_max?: boolean;
  /** Show percentiles (p50, p75, p99) */
  percentiles?: boolean;
  /** Enable colored output */
  colors?: boolean;
  /** Output format: undefined | 'json' | 'markdown' */
  format?: 'json' | 'markdown' | undefined;
  /** Filter benchmarks by regex */
  filter?: RegExp;
  /** Throw on errors instead of continuing */
  throw?: boolean;
}

/**
 * Measure-level options for individual benchmarks
 * These are passed to mitata's internal measure() function
 */
export interface MeasureOptions {
  /** Minimum number of samples (default: 12, recommended: 24 for HTTP) */
  min_samples?: number;
  /** Maximum number of samples (default: 1e9) */
  max_samples?: number;
  /** Minimum CPU time in nanoseconds (default: 642ms, recommended: 1000ms for HTTP) */
  min_cpu_time?: number;
  /** Number of warmup samples (default: 2, recommended: 5 for HTTP) */
  warmup_samples?: number;
  /** Samples per batch for micro-benchmarks (default: 4096) */
  batch_samples?: number;
  /** Threshold for trimming outliers (default: 12) */
  samples_threshold?: number;
}

/**
 * Preset configurations for different benchmark scenarios
 */
export const PRESETS = {
  /**
   * Quick benchmarks for development iteration
   * - Faster execution, less statistical accuracy
   */
  quick: {
    min_samples: 8,
    min_cpu_time: 300 * 1e6, // 300ms
    warmup_samples: 1,
  } satisfies MeasureOptions,

  /**
   * Default configuration - balanced accuracy and speed
   * - Good for most HTTP client benchmarks
   */
  default: {
    min_samples: 16,
    min_cpu_time: 642 * 1e6, // 642ms (mitata default)
    warmup_samples: 3,
  } satisfies MeasureOptions,

  /**
   * Thorough benchmarks for release documentation
   * - Higher statistical accuracy, longer execution
   */
  thorough: {
    min_samples: 24,
    min_cpu_time: 1000 * 1e6, // 1000ms
    warmup_samples: 5,
  } satisfies MeasureOptions,

  /**
   * Publication-quality benchmarks
   * - Maximum statistical accuracy for documentation
   * - Use with --expose-gc for best results
   */
  publication: {
    min_samples: 48,
    min_cpu_time: 2000 * 1e6, // 2000ms
    warmup_samples: 10,
  } satisfies MeasureOptions,

  /**
   * Micro-benchmarks (pure JS overhead, no network)
   * - Optimized for very fast operations
   */
  micro: {
    min_samples: 100,
    min_cpu_time: 500 * 1e6, // 500ms
    warmup_samples: 10,
    batch_samples: 8192, // Higher batch for micro-ops
  } satisfies MeasureOptions,
} as const;

/**
 * Get preset by name or from environment variable
 */
export function getPreset(name?: keyof typeof PRESETS): MeasureOptions {
  const envPreset = process.env.BENCH_PRESET as keyof typeof PRESETS | undefined;
  const presetName = name || envPreset || 'default';
  return PRESETS[presetName] || PRESETS.default;
}

/**
 * Default run options for consistent benchmark output
 */
export const DEFAULT_RUN_OPTIONS: BenchRunOptions = {
  avg: true,
  min_max: true,
  percentiles: true,
  colors: !process.env.NO_COLOR && process.env.BENCH_JSON !== '1',
  format: process.env.BENCH_JSON === '1' ? 'json' : undefined,
};

/**
 * Enhanced run function with preset support
 *
 * @example
 * ```ts
 * import { run, PRESETS } from './mitata-config.js';
 *
 * // Use default preset
 * await run();
 *
 * // Use thorough preset for documentation
 * await run({ ...DEFAULT_RUN_OPTIONS }, 'thorough');
 *
 * // Custom options
 * await run({ format: 'json' });
 * ```
 */
export async function run(
  options: BenchRunOptions = DEFAULT_RUN_OPTIONS,
  preset?: keyof typeof PRESETS
) {
  const presetConfig = getPreset(preset);

  // Log configuration if verbose
  if (process.env.BENCH_VERBOSE === '1') {
    console.log('\n[Benchmark Config]');
    console.log(`  Preset: ${preset || process.env.BENCH_PRESET || 'default'}`);
    console.log(`  Min samples: ${presetConfig.min_samples}`);
    console.log(`  Min CPU time: ${(presetConfig.min_cpu_time! / 1e6).toFixed(0)}ms`);
    console.log(`  Warmup samples: ${presetConfig.warmup_samples}`);
    console.log('');
  }

  return mitataRun({
    ...options,
    ...presetConfig,
  } as Parameters<typeof mitataRun>[0]);
}

/**
 * Helper to print benchmark methodology
 */
export function printMethodology(preset: keyof typeof PRESETS = 'default') {
  const config = PRESETS[preset];

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                      BENCHMARK METHODOLOGY                         ');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Preset:          ${preset}`);
  console.log(`Min samples:     ${config.min_samples} (per benchmark)`);
  console.log(`Min CPU time:    ${(config.min_cpu_time! / 1e6).toFixed(0)}ms`);
  console.log(`Warmup samples:  ${config.warmup_samples}`);
  console.log('');
  console.log('V8 JIT Warmup:');
  console.log('  - Each function executed 100+ times before measurement');
  console.log('  - Ensures TurboFan (optimizing JIT) compiles hot paths');
  console.log('  - Stabilizes Inline Caching for consistent performance');
  console.log('');
  console.log('Statistical Analysis:');
  console.log('  - Outliers removed: 4 (2 lowest + 2 highest when samples > 12)');
  console.log('  - Metrics: avg, min, max, p25, p50, p75, p99, p999');
  console.log('  - Time unit: auto-scaled (ns, µs, ms, s)');
  console.log('');
  console.log('For best results:');
  console.log('  - Run with: node --expose-gc benchmark/file.ts');
  console.log('  - Close other applications');
  console.log('  - Use: BENCH_PRESET=thorough pnpm bench:compare');
  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// V8 JIT Warmup System
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Warmup configuration
 */
export interface WarmupConfig {
  /** Number of iterations to run for warmup (default: 100) */
  iterations?: number;
  /** Whether to run GC after warmup if available (default: true) */
  gc?: boolean;
  /** Whether to show progress (default: false) */
  verbose?: boolean;
  /** Delay between warmup batches in ms (default: 10) */
  batchDelay?: number;
}

/**
 * Default warmup iterations based on preset
 */
export const WARMUP_ITERATIONS: Record<keyof typeof PRESETS, number> = {
  quick: 50,
  default: 100,
  thorough: 200,
  publication: 500,
  micro: 1000,
};

/**
 * Warmup a single async function to trigger V8 JIT optimization
 *
 * Runs the function multiple times to ensure:
 * 1. TurboFan compiles the hot path
 * 2. Inline caching stabilizes
 * 3. Hidden classes are optimized
 *
 * @param fn - Async function to warmup
 * @param iterations - Number of warmup iterations (default: 100)
 */
export async function warmupFunction(
  fn: () => Promise<unknown>,
  iterations: number = 100
): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
}

/**
 * Warmup multiple functions in parallel batches
 *
 * @param fns - Map of function names to async functions
 * @param config - Warmup configuration
 */
export async function warmupAll(
  fns: Record<string, () => Promise<unknown>>,
  config: WarmupConfig = {}
): Promise<void> {
  const {
    iterations = 100,
    gc: runGc = true,
    verbose = process.env.BENCH_VERBOSE === '1',
    batchDelay = 10,
  } = config;

  const fnEntries = Object.entries(fns);
  const total = fnEntries.length;

  if (verbose) {
    console.log(`\n[V8 JIT Warmup] Warming up ${total} functions (${iterations} iterations each)...`);
  }

  // Warmup each function sequentially to avoid interference
  for (let i = 0; i < fnEntries.length; i++) {
    const [name, fn] = fnEntries[i];

    if (verbose) {
      process.stdout.write(`  [${i + 1}/${total}] ${name}...`);
    }

    await warmupFunction(fn, iterations);

    if (verbose) {
      console.log(' ✓');
    }

    // Small delay between functions to let V8 optimize
    if (batchDelay > 0 && i < fnEntries.length - 1) {
      await new Promise(r => setTimeout(r, batchDelay));
    }
  }

  // Run GC if available to start measurements with clean heap
  if (runGc && typeof globalThis.gc === 'function') {
    if (verbose) {
      console.log('  Running garbage collection...');
    }
    globalThis.gc();
  }

  if (verbose) {
    console.log('[V8 JIT Warmup] Complete!\n');
  }
}

/**
 * Create a warmup phase for HTTP client benchmarks
 *
 * @example
 * ```ts
 * const warmup = createHttpWarmup(url);
 *
 * // Register all clients
 * warmup.add('axios', () => axios.get(url));
 * warmup.add('got', () => got.get(url).json());
 * warmup.add('recker', () => client.get('/').json());
 *
 * // Run warmup before benchmarks
 * await warmup.run();
 * ```
 */
export function createHttpWarmup(baseUrl: string, preset?: keyof typeof PRESETS) {
  const fns: Record<string, () => Promise<unknown>> = {};
  const iterations = WARMUP_ITERATIONS[preset || 'default'];

  return {
    /**
     * Add a function to warmup
     */
    add(name: string, fn: () => Promise<unknown>) {
      fns[name] = fn;
      return this;
    },

    /**
     * Run warmup for all registered functions
     */
    async run(config?: Partial<WarmupConfig>) {
      await warmupAll(fns, { iterations, ...config });
    },

    /**
     * Get the number of registered functions
     */
    get count() {
      return Object.keys(fns).length;
    },
  };
}

/**
 * Simple inline warmup that can be used directly in benchmark files
 *
 * @example
 * ```ts
 * // Before defining benchmarks
 * await inlineWarmup([
 *   () => axios.get(url),
 *   () => got.get(url).json(),
 *   () => client.get('/').json(),
 * ]);
 * ```
 */
export async function inlineWarmup(
  fns: Array<() => Promise<unknown>>,
  iterations: number = 100,
  verbose: boolean = process.env.BENCH_VERBOSE === '1'
): Promise<void> {
  if (verbose) {
    console.log(`\n[V8 JIT Warmup] Warming up ${fns.length} functions (${iterations} iterations each)...`);
  }

  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];

    for (let j = 0; j < iterations; j++) {
      await fn();
    }

    if (verbose) {
      process.stdout.write('.');
    }
  }

  // Run GC if available
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
  }

  if (verbose) {
    console.log(' done!\n');
  }
}
