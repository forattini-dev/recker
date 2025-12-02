import { createClient } from '../core/client.js';
import { LoadStats } from './stats.js';

export type LoadMode = 'throughput' | 'stress' | 'realistic';

export interface LoadConfig {
  url: string;
  users: number;
  duration: number; // seconds
  mode: LoadMode;
  http2?: boolean;
  rampUp?: number; // seconds to reach full concurrency
}

export class LoadGenerator {
  private config: LoadConfig;
  public stats: LoadStats;
  private running = false;

  constructor(config: LoadConfig) {
    this.config = config;
    this.stats = new LoadStats();
  }

  async start() {
    this.running = true;
    const startTime = Date.now();

    // Create a pool-optimized client
    const client = createClient({
      baseUrl: new URL(this.config.url).origin,
      observability: false, // Disable logging overhead
      http2: this.config.http2, // Enable HTTP/2 if requested
      concurrency: {
        max: this.config.users * 2,
        requestsPerInterval: Infinity,
        interval: 1000,
        agent: {
          connections: this.config.users,
          pipelining: this.config.mode === 'throughput' ? 2 : 1,
          keepAlive: true // Keep connections alive for better performance
        }
      },
      retry: {
        // Disable retries in stress mode to fail fast
        maxAttempts: this.config.mode === 'stress' ? 0 : 2
      },
      timeout: 5000 // 5s hard timeout per request
    });

    const path = new URL(this.config.url).pathname;

    // User loop function
    const userLoop = async () => {
      this.stats.activeUsers++;
      while (this.running) {
        const start = performance.now();
        const controller = new AbortController(); // New AbortController for each request
        try {
          if (this.config.mode === 'realistic') {
            // Think time: 50ms - 500ms
            await new Promise(r => setTimeout(r, 50 + Math.random() * 450));
          }

          // Use the controller's signal for the request
          const res = await client.get(path, { signal: controller.signal });
          
          // Critical: Consume response body to release the connection back to the pool
          await res.text();

          const duration = performance.now() - start;
          const bytes = Number(res.headers.get('content-length') || 0);
          
          this.stats.addResult(duration, res.status, bytes);
        } catch (err: any) {
          // If the request was aborted by timeout, it might throw AbortError
          if (err.name === 'AbortError' || err.code === 'UND_ERR_ABORTED') {
            this.stats.addResult(performance.now() - start, 0, 0, new Error('Request Aborted (timeout)'));
          } else {
            this.stats.addResult(performance.now() - start, 0, 0, err);
          }
        } finally {
          // Ensure controller is aborted if not already, to clean up any pending resources
          controller.abort();
        }

        if (this.config.mode === 'stress') {
            // Yield to event loop to prevent blocking stats reporting
            await new Promise(r => setImmediate(r));
        }
      }
      this.stats.activeUsers--;
    };

    // Ramp up users
    const users: Promise<void>[] = [];
    const rampUpMs = (this.config.rampUp || 0) * 1000;

    for (let i = 0; i < this.config.users; i++) {
        // Calculate start delay for linear ramp
        // Users start evenly distributed over the rampUp period
        const delay = rampUpMs > 0 ? (i / this.config.users) * rampUpMs : 0;

        const userSession = async () => {
            if (delay > 0) await new Promise(r => setTimeout(r, delay));
            if (!this.running) return; // Verify we haven't stopped during ramp
            await userLoop();
        };

        users.push(userSession());
    }

    // Stop timer
    setTimeout(() => {
      this.running = false;
    }, this.config.duration * 1000);

    return Promise.all(users);
  }

  stop() {
    this.running = false;
  }
}
