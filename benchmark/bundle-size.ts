/**
 * Bundle Size Comparison
 *
 * Compares bundle sizes of Recker variants vs competitors.
 * Measures: raw, minified, and gzipped sizes.
 *
 * Note: Uses execSync with hardcoded commands only - no user input.
 */

import { execSync } from 'node:child_process';
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const TEMP_DIR = join(process.cwd(), '.bundle-size-temp');

interface BundleInfo {
  name: string;
  raw: number;
  minified: number;
  gzipped: number;
  category: 'recker' | 'competitor';
}

// Ensure temp directory exists
if (existsSync(TEMP_DIR)) {
  rmSync(TEMP_DIR, { recursive: true });
}
mkdirSync(TEMP_DIR, { recursive: true });

// Create a minimal package.json for esbuild
writeFileSync(join(TEMP_DIR, 'package.json'), JSON.stringify({
  name: 'bundle-size-test',
  type: 'module',
  dependencies: {}
}));

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function measureBundle(name: string, code: string, category: 'recker' | 'competitor'): BundleInfo {
  const raw = Buffer.byteLength(code, 'utf8');

  // Write to temp file for minification
  const safeName = name.replace(/[^a-z0-9]/gi, '_');
  const tempFile = join(TEMP_DIR, `${safeName}.js`);
  const minFile = join(TEMP_DIR, `${safeName}.min.js`);

  writeFileSync(tempFile, code);

  try {
    // Minify with esbuild (hardcoded command, no user input)
    execSync(`pnpm dlx esbuild "${tempFile}" --minify --outfile="${minFile}"`, {
      stdio: 'pipe',
      cwd: TEMP_DIR
    });

    const minified = statSync(minFile).size;
    const minifiedCode = readFileSync(minFile, 'utf8');
    const gzipped = gzipSync(minifiedCode).length;

    return { name, raw, minified, gzipped, category };
  } catch {
    return { name, raw, minified: raw, gzipped: raw, category };
  }
}

function bundlePackage(packageName: string): string {
  const safeName = packageName.replace(/[^a-z0-9]/gi, '_');
  const outFile = join(TEMP_DIR, `${safeName}_bundle.js`);

  try {
    // Bundle with esbuild (hardcoded command structure)
    execSync(`pnpm dlx esbuild "${packageName}" --bundle --format=esm --platform=node --outfile="${outFile}"`, {
      stdio: 'pipe',
      cwd: process.cwd()
    });

    return readFileSync(outFile, 'utf8');
  } catch {
    return '';
  }
}

function bundleLocalFile(filePath: string, name: string): string {
  const safeName = name.replace(/[^a-z0-9]/gi, '_');
  const outFile = join(TEMP_DIR, `${safeName}_bundle.js`);

  try {
    execSync(`pnpm dlx esbuild "${filePath}" --bundle --format=esm --platform=node --outfile="${outFile}"`, {
      stdio: 'pipe',
      cwd: process.cwd()
    });

    return readFileSync(outFile, 'utf8');
  } catch {
    return '';
  }
}

function bundleBrowserFile(filePath: string, name: string): string {
  const safeName = name.replace(/[^a-z0-9]/gi, '_');
  const outFile = join(TEMP_DIR, `${safeName}_bundle.js`);

  try {
    // Use external for Node.js modules that may be dynamically imported
    // Include all common Node.js built-ins that might leak into browser builds
    const externals = [
      'node:*', 'stream', 'perf_hooks', 'async_hooks', 'fs', 'path', 'net', 'tls',
      'http', 'https', 'http2', 'zlib', 'crypto', 'buffer', 'util', 'os', 'child_process',
      'dns', 'dgram', 'events', 'readline', 'undici'
    ].map(e => `--external:${e}`).join(' ');

    execSync(`pnpm dlx esbuild "${filePath}" --bundle --format=esm --platform=browser ${externals} --outfile="${outFile}"`, {
      stdio: 'pipe',
      cwd: process.cwd()
    });

    return readFileSync(outFile, 'utf8');
  } catch {
    return '';
  }
}

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║                    Bundle Size Comparison                         ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

console.log('Building bundles...\n');

const results: BundleInfo[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Recker Variants (Node.js)
// ─────────────────────────────────────────────────────────────────────────────

console.log('📦 Recker Node.js variants...');

// recker (full) - use dist for pre-compiled JS
let code = bundleLocalFile('./dist/index.js', 'recker');
if (code) results.push(measureBundle('recker', code, 'recker'));

// recker-mini (Node.js)
code = bundleLocalFile('./dist/mini.js', 'recker-mini');
if (code) results.push(measureBundle('recker-mini', code, 'recker'));

// ─────────────────────────────────────────────────────────────────────────────
// Recker Browser Variants
// ─────────────────────────────────────────────────────────────────────────────

console.log('📦 Recker Browser variants...');

// recker-browser (full) - use dist to avoid TS compilation
code = bundleBrowserFile('./dist/browser/browser/index.js', 'recker-browser');
if (code) results.push(measureBundle('recker-browser', code, 'recker'));

// recker-browser-mini
code = bundleBrowserFile('./dist/browser/browser/mini.js', 'recker-browser-mini');
if (code) results.push(measureBundle('recker-browser-mini', code, 'recker'));

// ─────────────────────────────────────────────────────────────────────────────
// Competitors
// ─────────────────────────────────────────────────────────────────────────────

console.log('📦 Competitor libraries...');

const competitors = [
  'undici',
  'axios',
  'got',
  'ky',
  'node-fetch',
  'cross-fetch',
  'superagent',
  'needle',
  'wretch',
  'make-fetch-happen',
  'minipass-fetch',
  '@hapi/wreck',
];

for (const pkg of competitors) {
  console.log(`  - ${pkg}...`);
  code = bundlePackage(pkg);
  if (code) {
    results.push(measureBundle(pkg, code, 'competitor'));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Results
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('                           RESULTS                                 ');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Sort by gzipped size
results.sort((a, b) => a.gzipped - b.gzipped);

// Find smallest for comparison
const smallest = results[0].gzipped;

console.log('┌─────────────────────────┬──────────────┬──────────────┬──────────────┬────────────┐');
console.log('│ Library                 │ Raw          │ Minified     │ Gzipped      │ vs Smallest│');
console.log('├─────────────────────────┼──────────────┼──────────────┼──────────────┼────────────┤');

for (const r of results) {
  const marker = r.category === 'recker' ? ' ★' : '';
  const name = (r.name + marker).padEnd(23);
  const raw = formatBytes(r.raw).padStart(10);
  const min = formatBytes(r.minified).padStart(10);
  const gz = formatBytes(r.gzipped).padStart(10);
  const ratio = r.gzipped === smallest ? '  baseline' : `   +${((r.gzipped / smallest - 1) * 100).toFixed(0)}%`.padStart(8);

  console.log(`│ ${name} │ ${raw}   │ ${min}   │ ${gz}   │${ratio}  │`);
}

console.log('└─────────────────────────┴──────────────┴──────────────┴──────────────┴────────────┘');

console.log('\n★ = Recker variants');

// ─────────────────────────────────────────────────────────────────────────────
// Summary by Category
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('                    RECKER VARIANTS SUMMARY                        ');
console.log('═══════════════════════════════════════════════════════════════════\n');

const reckerResults = results.filter(r => r.category === 'recker');
reckerResults.sort((a, b) => a.gzipped - b.gzipped);

for (const r of reckerResults) {
  console.log(`${r.name.padEnd(25)} ${formatBytes(r.gzipped).padStart(10)} gzipped`);
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Output
// ─────────────────────────────────────────────────────────────────────────────

const jsonOutput = {
  timestamp: new Date().toISOString(),
  results: results.map(r => ({
    name: r.name,
    category: r.category,
    raw: r.raw,
    minified: r.minified,
    gzipped: r.gzipped,
    rawFormatted: formatBytes(r.raw),
    minifiedFormatted: formatBytes(r.minified),
    gzippedFormatted: formatBytes(r.gzipped),
  }))
};

writeFileSync(join(process.cwd(), 'benchmark', 'bundle-sizes.json'), JSON.stringify(jsonOutput, null, 2));
console.log('\n📄 Results saved to benchmark/bundle-sizes.json');

// Cleanup
rmSync(TEMP_DIR, { recursive: true });
