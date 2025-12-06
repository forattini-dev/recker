/**
 * JSON Benchmark Runner
 *
 * Runs all benchmarks and outputs structured JSON results for analysis.
 *
 * Usage:
 *   pnpm tsx benchmark/json-runner.ts
 *   pnpm tsx benchmark/json-runner.ts --output results.json
 *   pnpm tsx benchmark/json-runner.ts --iterations 5
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BenchmarkResult {
  name: string;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p75: number;
  p99: number;
  stdDev: number;
  samples: number;
  unit: 'ms' | 'µs' | 's';
}

interface BenchmarkGroup {
  group: string;
  benchmarks: BenchmarkResult[];
}

interface BenchmarkSuite {
  name: string;
  file: string;
  groups: BenchmarkGroup[];
  duration: number;
}

interface FullBenchmarkReport {
  meta: {
    timestamp: string;
    nodeVersion: string;
    platform: string;
    arch: string;
    iterations: number;
    totalDuration: number;
  };
  suites: BenchmarkSuite[];
  summary: {
    libraries: Record<string, {
      avgMs: number;
      testsRun: number;
      wins: number;
      losses: number;
    }>;
    fastest: string;
    slowest: string;
  };
}

const benchmarks = [
  { name: 'Simple GET', file: 'simple-get.ts' },
  { name: 'POST JSON', file: 'post-json.ts' },
  { name: 'Real-world', file: 'real-world.ts' },
  { name: 'Retry Scenario', file: 'retry-scenario.ts' },
  { name: 'Cache & Dedup', file: 'cache-dedup.ts' },
  { name: 'Streaming', file: 'streaming.ts' },
];

// Parse command line arguments
const args = process.argv.slice(2);
let outputFile = '';
let iterations = 1;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' || args[i] === '-o') {
    outputFile = args[++i];
  } else if (args[i] === '--iterations' || args[i] === '-i') {
    iterations = parseInt(args[++i]) || 1;
  }
}

function stripAnsi(str: string): string {
  // Remove all ANSI escape codes including color, bold, etc.
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\[[\d;]*m/g, '');
}

function parseJsonOutput(output: string): BenchmarkGroup[] {
  let groups: BenchmarkGroup[] = [];

  // Try JSON parsing first (mitata format: { layout, benchmarks })
  try {
    // Find the JSON object in output (mitata outputs a single JSON)
    const jsonMatch = output.match(/\{[\s\S]*"layout"[\s\S]*"benchmarks"[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);

      // Build group name map from layout
      const groupNames: Record<number, string> = {};
      if (data.layout) {
        data.layout.forEach((g: any, idx: number) => {
          groupNames[idx] = g.name || `Group ${idx}`;
        });
      }

      // Group benchmarks by their group index
      const groupedBenchmarks: Record<number, BenchmarkResult[]> = {};

      for (const bench of data.benchmarks || []) {
        const groupIdx = bench.group ?? 0;
        if (!groupedBenchmarks[groupIdx]) {
          groupedBenchmarks[groupIdx] = [];
        }

        // Get stats from the first run
        const stats = bench.runs?.[0]?.stats || {};

        // Convert nanoseconds to milliseconds (mitata outputs ns)
        const toMs = (ns: number) => ns / 1_000_000;

        groupedBenchmarks[groupIdx].push({
          name: bench.alias || bench.name || 'unknown',
          avg: toMs(stats.avg || 0),
          min: toMs(stats.min || 0),
          max: toMs(stats.max || 0),
          p50: toMs(stats.p50 || stats.avg || 0),
          p75: toMs(stats.p75 || 0),
          p99: toMs(stats.p99 || 0),
          stdDev: toMs((stats.max - stats.min) / 4 || 0),
          samples: stats.ticks || stats.samples?.length || 0,
          unit: 'ms'
        });
      }

      // Convert to array format
      for (const [groupIdx, benchmarks] of Object.entries(groupedBenchmarks)) {
        groups.push({
          group: groupNames[parseInt(groupIdx)] || `Group ${groupIdx}`,
          benchmarks
        });
      }
    }
  } catch (e) {
    // JSON parsing failed, will use text fallback
  }

  // If JSON parsing didn't find results, use text parsing
  if (groups.length === 0) {
    // Fallback: parse text output
    const cleanOutput = stripAnsi(output);
    const lines = cleanOutput.split('\n');

    let currentGroup = 'default';
    const benchmarks: BenchmarkResult[] = [];

    for (const line of lines) {
      // Match group headers (mitata uses • bullet point)
      const groupMatch = line.match(/^[•]\s+(.+)$/);
      if (groupMatch) {
        if (benchmarks.length > 0) {
          groups.push({ group: currentGroup, benchmarks: [...benchmarks] });
          benchmarks.length = 0;
        }
        currentGroup = groupMatch[1].trim();
        continue;
      }

      // Match benchmark results: "recker                         1.43 ms/iter   1.64 ms"
      // Format: name (spaces) avg unit/iter p75
      const match = line.match(/^([a-zA-Z][a-zA-Z0-9\s()+-]*?)\s{2,}(\d+\.?\d*)\s*(µs|ms|s)\/iter\s+(\d+\.?\d*)\s*(µs|ms|s)/);
      if (match) {
        const [, name, avg, unit, p75, p75Unit] = match;

        let avgMs = parseFloat(avg);
        if (unit === 'µs') avgMs /= 1000;
        else if (unit === 's') avgMs *= 1000;

        let p75Ms = parseFloat(p75);
        if (p75Unit === 'µs') p75Ms /= 1000;
        else if (p75Unit === 's') p75Ms *= 1000;

        benchmarks.push({
          name: name.trim(),
          avg: avgMs,
          min: avgMs * 0.8, // Estimate
          max: avgMs * 1.5, // Estimate
          p50: avgMs,
          p75: p75Ms,
          p99: p75Ms * 1.3, // Estimate
          stdDev: (p75Ms - avgMs) / 2,
          samples: 0,
          unit: 'ms'
        });
        continue;
      }

      // Match min/max line: "(253.28 µs … 4.93 ms)   2.01 ms"
      const rangeMatch = line.match(/^\s+\((\d+\.?\d*)\s*(µs|ms|s)\s*…\s*(\d+\.?\d*)\s*(µs|ms|s)\)\s+(\d+\.?\d*)\s*(µs|ms|s)/);
      if (rangeMatch && benchmarks.length > 0) {
        const [, min, minUnit, max, maxUnit, p99, p99Unit] = rangeMatch;
        const lastBench = benchmarks[benchmarks.length - 1];

        let minMs = parseFloat(min);
        if (minUnit === 'µs') minMs /= 1000;
        else if (minUnit === 's') minMs *= 1000;

        let maxMs = parseFloat(max);
        if (maxUnit === 'µs') maxMs /= 1000;
        else if (maxUnit === 's') maxMs *= 1000;

        let p99Ms = parseFloat(p99);
        if (p99Unit === 'µs') p99Ms /= 1000;
        else if (p99Unit === 's') p99Ms *= 1000;

        lastBench.min = minMs;
        lastBench.max = maxMs;
        lastBench.p99 = p99Ms;
        lastBench.stdDev = (maxMs - minMs) / 4;
      }
    }

    if (benchmarks.length > 0) {
      groups.push({ group: currentGroup, benchmarks });
    }
  }

  return groups;
}

async function runBenchmark(name: string, file: string): Promise<{ groups: BenchmarkGroup[], duration: number }> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    let output = '';

    const child = spawn('tsx', [join(__dirname, file)], {
      shell: true,
      env: { ...process.env, BENCH_JSON: '1', NO_COLOR: '1' }
    });

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.stderr?.on('data', () => {
      // Ignore stderr
    });

    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      if (code === 0) {
        resolve({ groups: parseJsonOutput(output), duration });
      } else {
        reject(new Error(`Benchmark ${name} failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function runAllBenchmarks(): Promise<FullBenchmarkReport> {
  const startTime = Date.now();
  const suites: BenchmarkSuite[] = [];
  const libraryStats: Record<string, { total: number; count: number; wins: number; losses: number }> = {};

  console.error('Starting benchmark suite...\n');

  for (const benchmark of benchmarks) {
    console.error(`Running: ${benchmark.name}...`);

    try {
      // Run multiple iterations and average
      const allResults: BenchmarkGroup[][] = [];

      for (let i = 0; i < iterations; i++) {
        if (iterations > 1) {
          console.error(`  Iteration ${i + 1}/${iterations}`);
          if (i > 0) await new Promise(r => setTimeout(r, 1000)); // Cool down
        }
        const { groups } = await runBenchmark(benchmark.name, benchmark.file);
        allResults.push(groups);
      }

      // Average results across iterations
      const averaged = averageResults(allResults);

      suites.push({
        name: benchmark.name,
        file: benchmark.file,
        groups: averaged,
        duration: Date.now() - startTime
      });

      // Track library stats
      for (const group of averaged) {
        const sorted = [...group.benchmarks].sort((a, b) => a.avg - b.avg);
        for (let i = 0; i < sorted.length; i++) {
          const b = sorted[i];
          const libName = normalizeLibName(b.name);
          if (!libraryStats[libName]) {
            libraryStats[libName] = { total: 0, count: 0, wins: 0, losses: 0 };
          }
          libraryStats[libName].total += b.avg;
          libraryStats[libName].count++;
          if (i === 0) libraryStats[libName].wins++;
          if (i === sorted.length - 1) libraryStats[libName].losses++;
        }
      }

      console.error(` ✓ (${averaged.reduce((sum, g) => sum + g.benchmarks.length, 0)} benchmarks)`);
    } catch (error) {
      console.error(` ✗ ${error}`);
    }
  }

  const totalDuration = Date.now() - startTime;

  // Calculate summary
  const libraries: Record<string, { avgMs: number; testsRun: number; wins: number; losses: number }> = {};
  let fastest = '';
  let slowest = '';
  let fastestAvg = Infinity;
  let slowestAvg = 0;

  for (const [lib, stats] of Object.entries(libraryStats)) {
    const avg = stats.total / stats.count;
    libraries[lib] = {
      avgMs: avg,
      testsRun: stats.count,
      wins: stats.wins,
      losses: stats.losses
    };

    if (avg < fastestAvg) {
      fastestAvg = avg;
      fastest = lib;
    }
    if (avg > slowestAvg) {
      slowestAvg = avg;
      slowest = lib;
    }
  }

  return {
    meta: {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      iterations,
      totalDuration
    },
    suites,
    summary: {
      libraries,
      fastest,
      slowest
    }
  };
}

function normalizeLibName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('recker')) return 'recker';
  if (lower.includes('undici')) return 'undici';
  if (lower.includes('fetch')) return 'fetch';
  if (lower.includes('axios')) return 'axios';
  if (lower.includes('got')) return 'got';
  if (lower.includes('ky')) return 'ky';
  if (lower.includes('needle')) return 'needle';
  if (lower.includes('superagent')) return 'superagent';
  return name;
}

function averageResults(allResults: BenchmarkGroup[][]): BenchmarkGroup[] {
  if (allResults.length === 1) return allResults[0];

  const merged: Map<string, Map<string, { sums: BenchmarkResult; count: number }>> = new Map();

  for (const results of allResults) {
    for (const group of results) {
      if (!merged.has(group.group)) {
        merged.set(group.group, new Map());
      }
      const groupMap = merged.get(group.group)!;

      for (const bench of group.benchmarks) {
        if (!groupMap.has(bench.name)) {
          groupMap.set(bench.name, { sums: { ...bench }, count: 1 });
        } else {
          const existing = groupMap.get(bench.name)!;
          existing.sums.avg += bench.avg;
          existing.sums.min = Math.min(existing.sums.min, bench.min);
          existing.sums.max = Math.max(existing.sums.max, bench.max);
          existing.sums.p50 += bench.p50;
          existing.sums.p75 += bench.p75;
          existing.sums.p99 += bench.p99;
          existing.sums.stdDev += bench.stdDev;
          existing.count++;
        }
      }
    }
  }

  const averaged: BenchmarkGroup[] = [];
  for (const [groupName, benchMap] of merged) {
    const benchmarks: BenchmarkResult[] = [];
    for (const [, { sums, count }] of benchMap) {
      benchmarks.push({
        ...sums,
        avg: sums.avg / count,
        p50: sums.p50 / count,
        p75: sums.p75 / count,
        p99: sums.p99 / count,
        stdDev: sums.stdDev / count
      });
    }
    averaged.push({ group: groupName, benchmarks });
  }

  return averaged;
}

// Main
runAllBenchmarks()
  .then((report) => {
    const json = JSON.stringify(report, null, 2);

    if (outputFile) {
      writeFileSync(outputFile, json);
      console.error(`\nResults saved to ${outputFile}`);
    } else {
      console.log(json);
    }

    // Print summary to stderr
    console.error('\n═══════════════════════════════════════════════════════════════════');
    console.error('                         BENCHMARK SUMMARY                          ');
    console.error('═══════════════════════════════════════════════════════════════════\n');

    const sorted = Object.entries(report.summary.libraries)
      .sort(([, a], [, b]) => a.avgMs - b.avgMs);

    console.error('Library         Avg (ms)     Tests    Wins    Losses');
    console.error('─────────────────────────────────────────────────────');

    for (const [lib, stats] of sorted) {
      const marker = lib === report.summary.fastest ? ' (fastest)' : lib === report.summary.slowest ? ' (slowest)' : '';
      console.error(
        `${lib.padEnd(15)} ${stats.avgMs.toFixed(3).padStart(8)}   ${String(stats.testsRun).padStart(5)}   ${String(stats.wins).padStart(5)}   ${String(stats.losses).padStart(6)}${marker}`
      );
    }

    console.error('─────────────────────────────────────────────────────');
    console.error(`\nTotal time: ${(report.meta.totalDuration / 1000).toFixed(2)}s`);
  })
  .catch(console.error);
