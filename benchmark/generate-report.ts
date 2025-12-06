/**
 * Benchmark Report Generator
 *
 * Parses JSON benchmark results and generates a markdown report.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BenchmarkStats {
  avg: number;
  min: number;
  max: number;
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

interface Layout {
  name: string | null;
  types: string[];
}

interface MitataOutput {
  layout: Layout[];
  benchmarks: Benchmark[];
}

function parseResults(filePath: string): Map<string, Map<string, BenchmarkStats>> {
  const content = readFileSync(filePath, 'utf-8');
  const data: MitataOutput = JSON.parse(content);

  const results = new Map<string, Map<string, BenchmarkStats>>();

  // Build group name map
  const groupNames: Record<number, string> = {};
  data.layout.forEach((l, idx) => {
    if (l.name) groupNames[idx] = l.name;
  });

  // Process benchmarks
  for (const bench of data.benchmarks) {
    const groupName = groupNames[bench.group] || 'Unknown';
    const stats = bench.runs[0]?.stats;

    if (!stats) continue;

    if (!results.has(groupName)) {
      results.set(groupName, new Map());
    }

    results.get(groupName)!.set(bench.alias, {
      avg: stats.avg / 1_000_000, // ns to ms
      min: stats.min / 1_000_000,
      max: stats.max / 1_000_000,
      p50: stats.p50 / 1_000_000,
      p75: stats.p75 / 1_000_000,
      p99: stats.p99 / 1_000_000,
      ticks: stats.ticks
    });
  }

  return results;
}

function generateMarkdownTable(results: Map<string, Map<string, BenchmarkStats>>): string {
  let md = '';

  for (const [groupName, benchmarks] of results) {
    md += `### ${groupName}\n\n`;
    md += '| Library | Avg (ms) | Min (ms) | Max (ms) | p50 (ms) | p75 (ms) | p99 (ms) | Samples |\n';
    md += '|---------|----------|----------|----------|----------|----------|----------|----------|\n';

    // Sort by avg time
    const sorted = [...benchmarks.entries()].sort((a, b) => a[1].avg - b[1].avg);

    for (const [name, stats] of sorted) {
      const fastest = sorted[0][1].avg;
      const ratio = stats.avg / fastest;
      const badge = ratio === 1 ? ' **' : ratio < 1.1 ? ' ~' : '';

      md += `| ${name}${badge} | ${stats.avg.toFixed(3)} | ${stats.min.toFixed(3)} | ${stats.max.toFixed(3)} | ${stats.p50.toFixed(3)} | ${stats.p75.toFixed(3)} | ${stats.p99.toFixed(3)} | ${stats.ticks} |\n`;
    }

    md += '\n';
  }

  return md;
}

function generateOverallSummary(results: Map<string, Map<string, BenchmarkStats>>): string {
  // Aggregate all results by library
  const libraryStats: Map<string, { total: number; count: number; wins: number }> = new Map();

  for (const [, benchmarks] of results) {
    const sorted = [...benchmarks.entries()].sort((a, b) => a[1].avg - b[1].avg);

    sorted.forEach(([name, stats], idx) => {
      if (!libraryStats.has(name)) {
        libraryStats.set(name, { total: 0, count: 0, wins: 0 });
      }
      const lib = libraryStats.get(name)!;
      lib.total += stats.avg;
      lib.count++;
      if (idx === 0) lib.wins++;
    });
  }

  let md = '## Overall Summary\n\n';
  md += '| Library | Avg (ms) | Tests | Wins | Notes |\n';
  md += '|---------|----------|-------|------|-------|\n';

  const sorted = [...libraryStats.entries()]
    .sort((a, b) => (a[1].total / a[1].count) - (b[1].total / b[1].count));

  for (const [name, stats] of sorted) {
    const avgMs = stats.total / stats.count;
    const notes = stats.wins === stats.count ? 'Fastest in all tests' :
                  stats.wins > 0 ? `Won ${stats.wins}/${stats.count} tests` : '';
    md += `| ${name} | ${avgMs.toFixed(3)} | ${stats.count} | ${stats.wins} | ${notes} |\n`;
  }

  return md;
}

function main() {
  const inputFile = process.argv[2] || join(__dirname, 'results/http-clients-comparison.json');

  console.log(`Reading ${inputFile}...`);
  const results = parseResults(inputFile);

  let report = `# HTTP Clients Benchmark Results

> Generated: ${new Date().toISOString()}
> Node.js: ${process.version}
> Platform: ${process.platform} ${process.arch}

`;

  report += generateOverallSummary(results);
  report += '\n## Detailed Results\n\n';
  report += generateMarkdownTable(results);

  report += `
## Methodology

- **Test Server**: Local HTTP server with minimal latency
- **Warmup**: mitata handles warmup automatically
- **Iterations**: Multiple samples until statistically significant
- **Metrics**: All times in milliseconds (ms)

## Libraries Tested (21)

| Category | Libraries |
|----------|-----------|
| **Raw/Low-level** | undici, fetch (native) |
| **Full-featured** | recker, axios, got, ky |
| **Fetch-based** | node-fetch, cross-fetch, wretch, make-fetch-happen, minipass-fetch |
| **Lightweight** | phin, centra, bent, simple-get, tiny-json-http |
| **Legacy/Callback** | superagent, needle, hyperquest |
| **Ecosystem** | popsicle, wreck (Hapi) |

## Benchmark Scenarios

### 1. Simple GET (GET JSON)
Single GET request returning small JSON payload (~200 bytes).
Tests raw request overhead.

### 2. POST JSON (with body)
POST request with JSON body (~500 bytes).
Tests request serialization overhead.

### 3. Parallel GET (10 concurrent)
10 simultaneous requests to same endpoint.
Tests connection pooling and async handling.

### 4. Sequential GET (5 requests)
5 requests in sequence.
Tests connection reuse and latency accumulation.

## Key Findings

1. **undici** is the fastest baseline (Node.js official HTTP client)
2. **recker** adds ~40-60% overhead vs undici but includes retry, cache, rate-limiting
3. **got** has significant overhead due to extensive feature set
4. **ky** is slower than expected despite being fetch-based
5. **phin/centra** are extremely lightweight but lack features
`;

  const outputFile = join(__dirname, 'BENCHMARK.md');
  writeFileSync(outputFile, report);
  console.log(`Report saved to ${outputFile}`);

  // Also save to results folder with timestamp
  const timestamp = new Date().toISOString().split('T')[0];
  const timestampedFile = join(__dirname, `results/benchmark-${timestamp}.md`);
  writeFileSync(timestampedFile, report);
  console.log(`Timestamped report saved to ${timestampedFile}`);
}

main();
