import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Resource limits - prevent excessive RAM/CPU usage
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 2,
        minForks: 1,
      },
    },
    maxConcurrency: 3,
    fileParallelism: false,

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
    },
  },
});