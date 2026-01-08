/**
 * Generate a compact summary JSON from benchmark results
 */

import { readFileSync, writeFileSync } from 'node:fs';

interface BenchmarkStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p75: number;
  p99: number;
  ticks: number;
}

interface BenchmarkRun {
  stats: BenchmarkStats;
  name: string;
}

interface Benchmark {
  alias: string;
  group: number;
  runs: BenchmarkRun[];
}

interface BenchmarkResult {
  layout: { name: string | null }[];
  benchmarks: Benchmark[];
}

function formatTime(ns: number): string {
  if (ns < 1000) return `${ns.toFixed(2)} ns`;
  if (ns < 1_000_000) return `${(ns / 1000).toFixed(2)} µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(2)} ms`;
  return `${(ns / 1_000_000_000).toFixed(2)} s`;
}

async function main() {
  const inputPath = process.argv[2] || 'benchmark/results/http-clients-comparison.json';
  const outputPath = process.argv[3] || 'benchmark/results/summary.json';

  console.log(`Reading: ${inputPath}`);
  const raw = readFileSync(inputPath, 'utf-8');
  const data: BenchmarkResult = JSON.parse(raw);

  // Extract group names
  const groups: Record<number, string> = {};
  data.layout.forEach((item, i) => {
    if (item.name) groups[i] = item.name;
  });

  // Build summary
  const summary: Record<string, Record<string, {
    avg: string;
    avg_ns: number;
    min: string;
    max: string;
    p50: string;
    p75: string;
    p99: string;
    samples: number;
  }>> = {};

  for (const bench of data.benchmarks) {
    const groupName = groups[bench.group] || `Group ${bench.group}`;
    if (!summary[groupName]) summary[groupName] = {};

    const stats = bench.runs[0]?.stats;
    if (stats) {
      summary[groupName][bench.alias] = {
        avg: formatTime(stats.avg),
        avg_ns: Math.round(stats.avg),
        min: formatTime(stats.min),
        max: formatTime(stats.max),
        p50: formatTime(stats.p50),
        p75: formatTime(stats.p75),
        p99: formatTime(stats.p99),
        samples: stats.ticks,
      };
    }
  }

  // Sort each group by avg_ns
  const sortedSummary: typeof summary = {};
  for (const [group, benchmarks] of Object.entries(summary)) {
    const sorted = Object.entries(benchmarks)
      .sort((a, b) => a[1].avg_ns - b[1].avg_ns);
    sortedSummary[group] = Object.fromEntries(sorted);
  }

  // Add metadata
  const output = {
    generated: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    results: sortedSummary,
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Summary written to: ${outputPath}`);
  console.log(`Size: ${(JSON.stringify(output).length / 1024).toFixed(1)} KB`);

  // Print quick overview
  console.log('\n📊 Quick Overview:\n');
  for (const [group, benchmarks] of Object.entries(sortedSummary)) {
    console.log(`${group}:`);
    const entries = Object.entries(benchmarks).slice(0, 5);
    for (const [name, stats] of entries) {
      console.log(`  ${name.padEnd(20)} ${stats.avg.padStart(10)}`);
    }
    if (Object.keys(benchmarks).length > 5) {
      console.log(`  ... and ${Object.keys(benchmarks).length - 5} more`);
    }
    console.log('');
  }
}

main().catch(console.error);
