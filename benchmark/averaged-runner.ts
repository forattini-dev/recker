/**
 * Averaged Benchmark Runner
 *
 * Runs each benchmark multiple times and calculates averaged results
 * for more statistically reliable comparisons.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BenchmarkResult {
  name: string;
  runs: number[];
  avg: number;
  min: number;
  max: number;
  stdDev: number;
}

interface BenchmarkSuiteResult {
  benchmark: string;
  iterations: number;
  results: Record<string, BenchmarkResult>;
}

const ITERATIONS = parseInt(process.env.BENCH_ITERATIONS || '5');

const benchmarks = [
  { name: 'Simple GET', file: 'simple-get.ts' },
  { name: 'POST JSON', file: 'post-json.ts' },
  { name: 'Real-world', file: 'real-world.ts' },
  { name: 'Retry Scenario', file: 'retry-scenario.ts' },
  { name: 'Cache & Dedup', file: 'cache-dedup.ts' },
  { name: 'Streaming', file: 'streaming.ts' },
  { name: 'API Simulation', file: 'api-simulation.ts' },
];

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║           Recker Averaged Benchmark Suite                         ║');
console.log('║                                                                   ║');
console.log(`║  Running ${ITERATIONS} iterations per benchmark for statistical accuracy   ║`);
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

// Strip ANSI escape codes from string
function stripAnsi(str: string): string {
  // Remove all ANSI escape codes including color, bold, etc.
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\[[\d;]*m/g, '');
}

function parseResults(output: string): Record<string, number> {
  const results: Record<string, number> = {};

  // Strip ANSI codes first
  const cleanOutput = stripAnsi(output);
  const lines = cleanOutput.split('\n');

  for (const line of lines) {
    // Match patterns like "recker                       1.05 ms/iter"
    // The name can include spaces and parentheses like "recker (cache + dedup)"
    const match = line.match(/^([a-zA-Z][a-zA-Z0-9\s()+-]*?)\s{2,}(\d+\.?\d*)\s*(µs|ms|s)\/iter/);
    if (match) {
      const [, name, value, unit] = match;
      let timeMs = parseFloat(value);

      // Convert to milliseconds
      if (unit === 'µs') timeMs /= 1000;
      else if (unit === 's') timeMs *= 1000;

      results[name.trim()] = timeMs;
    }
  }

  return results;
}

function calculateStats(runs: number[]): { avg: number; min: number; max: number; stdDev: number } {
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  const min = Math.min(...runs);
  const max = Math.max(...runs);
  const variance = runs.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / runs.length;
  const stdDev = Math.sqrt(variance);

  return { avg, min, max, stdDev };
}

async function runBenchmark(name: string, file: string): Promise<Record<string, number>> {
  return new Promise((resolve, reject) => {
    let output = '';

    const child = spawn('tsx', [join(__dirname, file)], {
      shell: true,
      env: { ...process.env, NO_COLOR: '1' }
    });

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.stderr?.on('data', (data) => {
      // Ignore stderr for parsing
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(parseResults(output));
      } else {
        reject(new Error(`Benchmark failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function runAveragedBenchmarks() {
  const allResults: BenchmarkSuiteResult[] = [];
  const startTime = Date.now();

  for (const benchmark of benchmarks) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  ${benchmark.name}`);
    console.log(`${'═'.repeat(70)}`);

    const runResults: Record<string, number[]> = {};

    // Run iterations SEQUENTIALLY to avoid interference
    for (let i = 1; i <= ITERATIONS; i++) {
      process.stdout.write(`  Running iteration ${i}/${ITERATIONS}...`);

      // Small delay between iterations to let system stabilize
      if (i > 1) {
        await new Promise(r => setTimeout(r, 1000));
      }

      try {
        const results = await runBenchmark(benchmark.name, benchmark.file);

        for (const [lib, time] of Object.entries(results)) {
          if (!runResults[lib]) runResults[lib] = [];
          runResults[lib].push(time);
        }

        console.log(' ✓');
      } catch (error) {
        console.log(` ✗ (${error})`);
      }
    }

    // Calculate stats
    const benchmarkResult: BenchmarkSuiteResult = {
      benchmark: benchmark.name,
      iterations: ITERATIONS,
      results: {}
    };

    console.log('\n  Results (averaged over ' + ITERATIONS + ' runs):');
    console.log('  ' + '─'.repeat(66));
    console.log('  Library                      Avg (ms)    Min      Max      StdDev');
    console.log('  ' + '─'.repeat(66));

    const sortedLibs = Object.entries(runResults)
      .map(([name, runs]) => ({ name, ...calculateStats(runs), runs }))
      .sort((a, b) => a.avg - b.avg);

    for (const { name, avg, min, max, stdDev, runs } of sortedLibs) {
      benchmarkResult.results[name] = { name, runs, avg, min, max, stdDev };

      const avgStr = avg.toFixed(3).padStart(8);
      const minStr = min.toFixed(3).padStart(8);
      const maxStr = max.toFixed(3).padStart(8);
      const stdStr = stdDev.toFixed(3).padStart(8);

      console.log(`  ${name.padEnd(28)} ${avgStr} ${minStr} ${maxStr} ${stdStr}`);
    }

    // Show winner
    if (sortedLibs.length > 0) {
      const winner = sortedLibs[0];
      const reckerResult = sortedLibs.find(r => r.name.toLowerCase().includes('recker'));

      console.log('  ' + '─'.repeat(66));
      console.log(`  Fastest: ${winner.name} (${winner.avg.toFixed(3)}ms avg)`);

      if (reckerResult && reckerResult !== winner) {
        const diff = ((reckerResult.avg / winner.avg - 1) * 100).toFixed(1);
        console.log(`  Recker vs winner: +${diff}%`);
      }
    }

    allResults.push(benchmarkResult);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║              Averaged Benchmark Suite Complete                    ║');
  console.log('║                                                                   ║');
  console.log(`║  Total time: ${duration}s                                              ║`);
  console.log(`║  Iterations per benchmark: ${ITERATIONS}                                    ║`);
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  // Summary comparison
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                    SUMMARY: Recker vs Competitors                  ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  for (const suite of allResults) {
    const recker = Object.values(suite.results).find(r =>
      r.name.toLowerCase() === 'recker' || r.name.toLowerCase() === 'recker (fast)'
    );

    if (!recker) continue;

    console.log(`${suite.benchmark}:`);

    const competitors = Object.values(suite.results)
      .filter(r => !r.name.toLowerCase().includes('recker') &&
                   !r.name.toLowerCase().includes('undici') &&
                   !r.name.toLowerCase().includes('fetch'))
      .sort((a, b) => a.avg - b.avg);

    for (const comp of competitors) {
      const diff = ((comp.avg / recker.avg - 1) * 100);
      const icon = diff > 0 ? '✅' : '❌';
      const sign = diff > 0 ? '+' : '';
      console.log(`  ${icon} vs ${comp.name.padEnd(15)}: ${sign}${diff.toFixed(1)}% ${diff > 0 ? '(Recker wins)' : '(Recker loses)'}`);
    }
    console.log('');
  }
}

runAveragedBenchmarks().catch(console.error);
