import { createClient } from '../src/index.js';
import { performance } from 'perf_hooks';
import pc from 'picocolors';

interface LoadTestConfig {
  url: string;
  users: number;
  duration: number; // seconds
  mode: 'throughput' | 'stress' | 'realistic';
}

interface LoadTestResult {
  totalRequests: number;
  successful: number;
  failed: number;
  rps: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  errors: Record<string, number>;
}

export async function runLoadTest(config: LoadTestConfig) {
  console.log(pc.cyan(`
🚀 Starting Load Test: ${config.mode.toUpperCase()}`));
  console.log(pc.gray(`Target: ${config.url}`));
  console.log(pc.gray(`Users: ${config.users} | Duration: ${config.duration}s
`));

  // 1. Setup Client based on mode
  const client = createClient({
    baseUrl: new URL(config.url).origin,
    // In stress mode, we might want to disable some overhead
    observability: config.mode !== 'stress',
    // Connection pooling is critical for load testing
    concurrency: {
        max: config.users * 2, // Allow some buffer
        requestsPerInterval: Infinity,
        interval: 1000,
        agent: {
            connections: config.users, // 1 connection per user roughly
            pipelining: 1,
            keepAlive: true
        }
    },
    retry: {
        maxAttempts: config.mode === 'stress' ? 0 : 2
    }
  });

  const path = new URL(config.url).pathname;
  const stats = {
    total: 0,
    success: 0,
    failed: 0,
    latencies: [] as number[],
    errors: {} as Record<string, number>
  };

  let running = true;
  const startTime = performance.now();

  // 2. User Simulation Loop
  const userLoop = async (id: number) => {
    while (running) {
      const reqStart = performance.now();
      try {
        // In realistic mode, we might add "think time"
        if (config.mode === 'realistic') {
            await new Promise(r => setTimeout(r, Math.random() * 1000)); // 0-1s think time
        }

        await client.get(path);
        stats.success++;
      } catch (err: any) {
        stats.failed++;
        const msg = err.message || 'Unknown Error';
        stats.errors[msg] = (stats.errors[msg] || 0) + 1;
      } finally {
        stats.total++;
        stats.latencies.push(performance.now() - reqStart);
      }

      // Yield to event loop to allow I/O processing
      if (config.mode === 'stress') {
          // minimal yield
          await new Promise(r => setImmediate(r)); 
      }
    }
  };

  // 3. Start Users
  const users = Array.from({ length: config.users }, (_, i) => userLoop(i));

  // 4. Monitor & Timer
  const timer = setInterval(() => {
    const elapsed = (performance.now() - startTime) / 1000;
    const rps = Math.round(stats.total / elapsed);
    process.stdout.write(`\rRunning... T: ${elapsed.toFixed(1)}s | Req: ${stats.total} | RPS: ${rps} | Err: ${stats.failed}`);
  }, 100);

  // End test
  await new Promise(resolve => setTimeout(resolve, config.duration * 1000));
  running = false;
  clearInterval(timer);
  
  // Wait for pending requests (optional, or just detach)
  // await Promise.all(users); 

  const totalTime = (performance.now() - startTime) / 1000;
  
  // 5. Calc Stats
  stats.latencies.sort((a, b) => a - b);
  const avg = stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length || 0;
  const p95 = stats.latencies[Math.floor(stats.latencies.length * 0.95)] || 0;
  const p99 = stats.latencies[Math.floor(stats.latencies.length * 0.99)] || 0;

  console.log('\n\n' + pc.bold(pc.green('📊 Results:')));
  console.log(`  Requests:    ${stats.total}`);
  console.log(`  RPS:         ${Math.round(stats.total / totalTime)}`);
  console.log(`  Success:     ${stats.success} (${((stats.success/stats.total)*100).toFixed(1)}%)`);
  console.log(`  Failed:      ${stats.failed}`);
  console.log(`  Latency:
`);
  console.log(`    Avg:       ${avg.toFixed(2)}ms`);
  console.log(`    P95:       ${p95.toFixed(2)}ms`);
  console.log(`    P99:       ${p99.toFixed(2)}ms`);
  
  if (Object.keys(stats.errors).length > 0) {
      console.log(pc.red('\n  Errors:'));
      Object.entries(stats.errors).forEach(([err, count]) => {
          console.log(`    ${count}x ${err}`);
      });
  }
}

// CLI Entrypoint if run directly
if (process.argv[1] === import.meta.filename) {
    const url = process.argv[2] || 'https://httpbin.org/get';
    const users = parseInt(process.argv[3] || '10');
    const duration = parseInt(process.argv[4] || '10');
    const mode = (process.argv[5] || 'throughput') as any;

    runLoadTest({ url, users, duration, mode }).catch(console.error);
}
