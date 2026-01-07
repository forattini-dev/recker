import { availableParallelism, cpus } from 'node:os';
import { defineConfig } from 'vitest/config';

const cpuCount = typeof availableParallelism === 'function' ? availableParallelism() : cpus().length;
const defaultMaxWorkers = Math.min(6, Math.max(1, cpuCount - 1));
const envMaxWorkers = process.env.VITEST_MAX_WORKERS?.trim();
const maxWorkers = envMaxWorkers
  ? (/^\d+%$/.test(envMaxWorkers) ? envMaxWorkers : Number.parseInt(envMaxWorkers, 10))
  : defaultMaxWorkers;
const resolvedMaxWorkers = typeof maxWorkers === 'number'
  ? (Number.isFinite(maxWorkers) ? maxWorkers : defaultMaxWorkers)
  : maxWorkers;

export default defineConfig({
  test: {
    // Resource limits - keep tests parallel but bounded
    pool: 'forks',
    maxWorkers: resolvedMaxWorkers,
    maxConcurrency: 3,
    fileParallelism: true,

    include: ['test/**/*.test.ts'],
    exclude: ['docs/**', 'node_modules/**', 'benchmark/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**',
        'src/index.ts',
        'src/constants.ts', // Constants only
        'src/scrape/types.ts',
        'src/udp/index.ts', // Re-export only
        'src/cli/**', // CLI not unit testable
        'src/utils/colors.ts', // Color detection at module load time
        'src/cache/redis-storage.ts', // Requires Redis server
        'src/bench/**', // Benchmark utilities
        'src/**/index.ts', // Re-export files
        'src/webrtc/**', // Requires WebRTC runtime
        'src/protocols/ftp.ts', // Requires FTP server
        'src/transport/udp.ts', // Requires UDP socket runtime
        'src/plugins/types.ts', // Type definitions only
        'src/utils/download.ts', // Requires filesystem operations
        'src/websocket/client.ts', // Requires WebSocket runtime
        'src/transport/undici.ts', // Requires undici diagnostics runtime
      ],
      all: true,
      thresholds: {
        lines: 88,
        functions: 90,
        branches: 86,
        statements: 88,
      },
    },
  },
});
