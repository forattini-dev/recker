/**
 * Averaged HTTP Clients Comparison
 *
 * Runs the http-clients-comparison benchmark multiple times (default: 7)
 * and produces averaged results with statistical analysis.
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ITERATIONS = parseInt(process.env.BENCH_ITERATIONS || '7');
const OUTPUT_DIR = join(__dirname, 'results');

interface BenchmarkStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p75: number;
  p99: number;
  ticks: number;
}

interface SingleRunResult {
  layout: { name: string | null }[];
  benchmarks: Array<{
    alias: string;
    group: number;
    runs: Array<{ stats: BenchmarkStats }>;
  }>;
}

interface AveragedResult {
  avg: number;
  min: number;
  max: number;
  stdDev: number;
  p50: number;
  p75: number;
  p99: number;
  runs: number[];
}

interface FinalResult {
  generated: string;
  iterations: number;
  node: string;
  platform: string;
  arch: string;
  results: Record<string, Record<string, AveragedResult & { avg_formatted: string }>>;
}

function formatTime(ns: number): string {
  if (ns < 1000) return `${ns.toFixed(2)} ns`;
  if (ns < 1_000_000) return `${(ns / 1000).toFixed(2)} µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(2)} ms`;
  return `${(ns / 1_000_000_000).toFixed(2)} s`;
}

function calculateStats(runs: number[]): { avg: number; min: number; max: number; stdDev: number } {
  const avg = runs.reduce((a, b) => a + b, 0) / runs.length;
  const min = Math.min(...runs);
  const max = Math.max(...runs);
  const variance = runs.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / runs.length;
  const stdDev = Math.sqrt(variance);
  return { avg, min, max, stdDev };
}

async function runBenchmark(): Promise<SingleRunResult> {
  return new Promise((resolve, reject) => {
    let output = '';

    const child = spawn('tsx', [join(__dirname, 'http-clients-comparison.ts')], {
      shell: true,
      env: {
        ...process.env,
        BENCH_JSON: '1',
        NO_COLOR: '1',
        BENCH_PRESET: process.env.BENCH_PRESET || 'quick'  // Use quick for iterations
      }
    });

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.stderr?.on('data', (data) => {
      // Show progress on stderr
      process.stderr.write(data);
    });

    child.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          reject(new Error(`Failed to parse JSON output: ${e}`));
        }
      } else {
        reject(new Error(`Benchmark failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        Averaged HTTP Clients Comparison Benchmark                 ║');
  console.log('║                                                                   ║');
  console.log(`║  Running ${ITERATIONS} iterations for statistical reliability             ║`);
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  // Collect results from multiple runs
  // Structure: group -> alias -> array of avg values
  const collectedResults: Record<string, Record<string, {
    avgRuns: number[];
    p50Runs: number[];
    p75Runs: number[];
    p99Runs: number[];
  }>> = {};

  let groupNames: Record<number, string> = {};

  const startTime = Date.now();

  for (let i = 1; i <= ITERATIONS; i++) {
    process.stdout.write(`\n🔄 Iteration ${i}/${ITERATIONS}... `);

    // Small delay between iterations
    if (i > 1) {
      await new Promise(r => setTimeout(r, 2000));
    }

    try {
      const result = await runBenchmark();

      // Extract group names on first run
      if (i === 1) {
        result.layout.forEach((item, idx) => {
          if (item.name) groupNames[idx] = item.name;
        });
      }

      // Collect stats
      for (const bench of result.benchmarks) {
        const groupName = groupNames[bench.group] || `Group ${bench.group}`;
        if (!collectedResults[groupName]) collectedResults[groupName] = {};
        if (!collectedResults[groupName][bench.alias]) {
          collectedResults[groupName][bench.alias] = {
            avgRuns: [],
            p50Runs: [],
            p75Runs: [],
            p99Runs: []
          };
        }

        const stats = bench.runs[0]?.stats;
        if (stats) {
          collectedResults[groupName][bench.alias].avgRuns.push(stats.avg);
          collectedResults[groupName][bench.alias].p50Runs.push(stats.p50);
          collectedResults[groupName][bench.alias].p75Runs.push(stats.p75);
          collectedResults[groupName][bench.alias].p99Runs.push(stats.p99);
        }
      }

      console.log('✓');
    } catch (error) {
      console.log(`✗ (${error})`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n⏱️  Total time: ${duration} minutes`);

  // Calculate final averaged results
  const finalResults: FinalResult = {
    generated: new Date().toISOString(),
    iterations: ITERATIONS,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    results: {}
  };

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                    AVERAGED RESULTS                                ');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  for (const [groupName, benchmarks] of Object.entries(collectedResults)) {
    finalResults.results[groupName] = {};

    console.log(`\n📊 ${groupName}:`);
    console.log('─'.repeat(70));
    console.log('  Library                      Avg          StdDev      Min → Max');
    console.log('─'.repeat(70));

    // Calculate stats and sort by average
    const sorted = Object.entries(benchmarks)
      .map(([alias, data]) => {
        const avgStats = calculateStats(data.avgRuns);
        const p50Stats = calculateStats(data.p50Runs);
        const p75Stats = calculateStats(data.p75Runs);
        const p99Stats = calculateStats(data.p99Runs);

        return {
          alias,
          avg: avgStats.avg,
          min: avgStats.min,
          max: avgStats.max,
          stdDev: avgStats.stdDev,
          p50: p50Stats.avg,
          p75: p75Stats.avg,
          p99: p99Stats.avg,
          runs: data.avgRuns
        };
      })
      .sort((a, b) => a.avg - b.avg);

    for (const result of sorted) {
      finalResults.results[groupName][result.alias] = {
        avg: Math.round(result.avg),
        avg_formatted: formatTime(result.avg),
        min: Math.round(result.min),
        max: Math.round(result.max),
        stdDev: Math.round(result.stdDev),
        p50: Math.round(result.p50),
        p75: Math.round(result.p75),
        p99: Math.round(result.p99),
        runs: result.runs.map(r => Math.round(r))
      };

      const avgStr = formatTime(result.avg).padStart(10);
      const stdStr = `±${formatTime(result.stdDev)}`.padStart(12);
      const rangeStr = `${formatTime(result.min)} → ${formatTime(result.max)}`;

      console.log(`  ${result.alias.padEnd(28)} ${avgStr} ${stdStr}    ${rangeStr}`);
    }

    // Show winner comparison
    if (sorted.length >= 2) {
      const winner = sorted[0];
      const reckerMini = sorted.find(r => r.alias === 'recker-mini');
      const recker = sorted.find(r => r.alias === 'recker');

      console.log('─'.repeat(70));
      console.log(`  🏆 Fastest: ${winner.alias} (${formatTime(winner.avg)})`);

      if (reckerMini && reckerMini !== winner) {
        const diff = ((reckerMini.avg / winner.avg - 1) * 100).toFixed(1);
        console.log(`  📈 recker-mini vs winner: +${diff}%`);
      }
    }
  }

  // Save results
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const outputPath = join(OUTPUT_DIR, 'averaged-comparison.json');
  writeFileSync(outputPath, JSON.stringify(finalResults, null, 2));
  console.log(`\n✅ Results saved to: ${outputPath}`);

  // Also save a timestamped version
  const timestamp = new Date().toISOString().split('T')[0];
  const timestampedPath = join(OUTPUT_DIR, `averaged-comparison-${timestamp}.json`);
  writeFileSync(timestampedPath, JSON.stringify(finalResults, null, 2));
  console.log(`✅ Timestamped copy: ${timestampedPath}`);

  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║              Averaged Benchmark Complete!                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
}

main().catch(console.error);
