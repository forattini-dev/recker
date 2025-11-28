import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const benchmarks = [
  { name: 'Simple GET', file: 'simple-get.ts' },
  { name: 'POST JSON', file: 'post-json.ts' },
  { name: 'Retry Scenario', file: 'retry-scenario.ts' },
  { name: 'Cache & Dedup', file: 'cache-dedup.ts' },
  { name: 'Streaming', file: 'streaming.ts' },
  { name: 'Real-world', file: 'real-world.ts' },
];

console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║              Recker Benchmark Suite                  ║');
console.log('║                                                       ║');
console.log('║  Running comprehensive benchmarks...                  ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');

async function runBenchmark(name: string, file: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${name}`);
  console.log('='.repeat(60));

  return new Promise((resolve, reject) => {
    const child = spawn('tsx', [join(__dirname, file)], {
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Benchmark failed with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function runAll() {
  const startTime = Date.now();

  for (const benchmark of benchmarks) {
    try {
      await runBenchmark(benchmark.name, benchmark.file);
    } catch (error) {
      console.error(`\n❌ Failed to run ${benchmark.name}:`, error);
      process.exit(1);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║              Benchmark Suite Complete                 ║');
  console.log('║                                                       ║');
  console.log(`║  Total time: ${duration}s${' '.repeat(40 - duration.length)}║`);
  console.log('╚═══════════════════════════════════════════════════════╝\n');
}

runAll().catch(console.error);
