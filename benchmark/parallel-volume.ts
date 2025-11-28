import { run, bench, group, summary } from 'mitata';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createClient, ClientPool } from '../src/index.js';
import axios from 'axios';
import got from 'got';
import ky from 'ky';

// ============================================================================
// BENCHMARK: Parallel Request Volume
// ============================================================================
// Tests high-volume parallel requests across:
// - Same domain (connection reuse)
// - Multiple domains (connection pooling)
// - Repeated URLs (deduplication)
// ============================================================================

// Setup multiple mock servers to simulate different domains
const servers: Array<{ server: ReturnType<typeof createServer>; port: number; url: string }> = [];

async function createMockServer(delay = 0): Promise<{ server: ReturnType<typeof createServer>; port: number; url: string }> {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const respond = () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        path: req.url,
        timestamp: Date.now(),
        server: (server.address() as any)?.port
      }));
    };

    if (delay > 0) {
      setTimeout(respond, delay);
    } else {
      respond();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  return { server, port, url: `http://localhost:${port}` };
}

// Create 5 mock servers to simulate different domains
console.log('Starting mock servers...');
for (let i = 0; i < 5; i++) {
  servers.push(await createMockServer(5)); // 5ms simulated latency
}
console.log(`Started ${servers.length} mock servers\n`);

// Helper to generate URLs
const getServerUrl = (serverIndex: number, path: string) =>
  `${servers[serverIndex % servers.length].url}${path}`;

// ============================================================================
// BENCHMARK SCENARIOS
// ============================================================================

console.log('┌─────────────────────────────────────────────────────────────────┐');
console.log('│  Benchmark: Parallel Request Volume                             │');
console.log('│  - Same domain requests                                         │');
console.log('│  - Multiple domains                                             │');
console.log('│  - Repeated URLs (dedup test)                                   │');
console.log('└─────────────────────────────────────────────────────────────────┘\n');

// Setup clients
const recker = createClient({ baseUrl: servers[0].url });
const reckerWithDedup = createClient({
  baseUrl: servers[0].url,
  dedup: {}
});

// ============================================================================
// SCENARIO 1: Same Domain - 50 Parallel Requests
// ============================================================================

summary(() => {
  group('Same Domain - 50 parallel requests', () => {
    const urls = Array.from({ length: 50 }, (_, i) => `/user/${i}`);
    const fullUrls = urls.map(path => `${servers[0].url}${path}`);

    bench('recker', async () => {
      await Promise.all(urls.map(path => recker.get(path).json()));
    });

    bench('axios', async () => {
      await Promise.all(fullUrls.map(url => axios.get(url)));
    });

    bench('got', async () => {
      await Promise.all(fullUrls.map(url => got.get(url).json()));
    });

    bench('ky', async () => {
      await Promise.all(fullUrls.map(url => ky.get(url).json()));
    });
  });
});

// ============================================================================
// SCENARIO 2: Same Domain - 100 Parallel Requests
// ============================================================================

summary(() => {
  group('Same Domain - 100 parallel requests', () => {
    const urls = Array.from({ length: 100 }, (_, i) => `/item/${i}`);
    const fullUrls = urls.map(path => `${servers[0].url}${path}`);

    bench('recker', async () => {
      await Promise.all(urls.map(path => recker.get(path).json()));
    });

    bench('axios', async () => {
      await Promise.all(fullUrls.map(url => axios.get(url)));
    });

    bench('got', async () => {
      await Promise.all(fullUrls.map(url => got.get(url).json()));
    });

    bench('ky', async () => {
      await Promise.all(fullUrls.map(url => ky.get(url).json()));
    });
  });
});

// ============================================================================
// SCENARIO 3: Multiple Domains - 50 Requests across 5 domains
// ============================================================================

// Pre-create ClientPool for multi-domain benchmarks
const clientPool = new ClientPool();
// Pre-warm the pool with all servers
servers.forEach(s => clientPool.get(s.url));

summary(() => {
  group('Multiple Domains - 50 requests across 5 domains', () => {
    // 10 requests per domain
    const requests = Array.from({ length: 50 }, (_, i) => ({
      serverIndex: i % 5,
      path: `/data/${Math.floor(i / 5)}`
    }));

    bench('recker (ClientPool - cached)', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          clientPool.get(servers[serverIndex].url).get(path).json()
        )
      );
    });

    bench('recker (separate clients)', async () => {
      const clients = servers.map(s => createClient({ baseUrl: s.url }));
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          clients[serverIndex].get(path).json()
        )
      );
    });

    bench('axios', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          axios.get(`${servers[serverIndex].url}${path}`)
        )
      );
    });

    bench('got', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          got.get(`${servers[serverIndex].url}${path}`).json()
        )
      );
    });

    bench('ky', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          ky.get(`${servers[serverIndex].url}${path}`).json()
        )
      );
    });
  });
});

// ============================================================================
// SCENARIO 4: Multiple Domains - 100 Requests across 5 domains
// ============================================================================

summary(() => {
  group('Multiple Domains - 100 requests across 5 domains', () => {
    // 20 requests per domain
    const requests = Array.from({ length: 100 }, (_, i) => ({
      serverIndex: i % 5,
      path: `/resource/${Math.floor(i / 5)}`
    }));

    bench('recker (ClientPool - cached)', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          clientPool.get(servers[serverIndex].url).get(path).json()
        )
      );
    });

    bench('recker (separate clients)', async () => {
      const clients = servers.map(s => createClient({ baseUrl: s.url }));
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          clients[serverIndex].get(path).json()
        )
      );
    });

    bench('axios', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          axios.get(`${servers[serverIndex].url}${path}`)
        )
      );
    });

    bench('got', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          got.get(`${servers[serverIndex].url}${path}`).json()
        )
      );
    });

    bench('ky', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          ky.get(`${servers[serverIndex].url}${path}`).json()
        )
      );
    });
  });
});

// ============================================================================
// SCENARIO 5: Repeated URLs - 50 requests to 5 unique URLs (90% duplicates)
// ============================================================================

summary(() => {
  group('Repeated URLs - 50 requests, only 5 unique (90% duplicates)', () => {
    // Only 5 unique URLs, repeated 10 times each
    const uniquePaths = ['/api/1', '/api/2', '/api/3', '/api/4', '/api/5'];
    const paths = Array.from({ length: 50 }, (_, i) => uniquePaths[i % 5]);
    const fullUrls = paths.map(path => `${servers[0].url}${path}`);

    bench('recker (no dedup)', async () => {
      await Promise.all(paths.map(path => recker.get(path).json()));
    });

    bench('recker (with dedup)', async () => {
      await Promise.all(paths.map(path => reckerWithDedup.get(path).json()));
    });

    bench('axios', async () => {
      await Promise.all(fullUrls.map(url => axios.get(url)));
    });

    bench('got', async () => {
      await Promise.all(fullUrls.map(url => got.get(url).json()));
    });

    bench('ky', async () => {
      await Promise.all(fullUrls.map(url => ky.get(url).json()));
    });
  });
});

// ============================================================================
// SCENARIO 6: Heavy Duplicates - 100 requests to 10 unique URLs
// ============================================================================

summary(() => {
  group('Heavy Duplicates - 100 requests, only 10 unique (90% duplicates)', () => {
    const uniquePaths = Array.from({ length: 10 }, (_, i) => `/endpoint/${i}`);
    const paths = Array.from({ length: 100 }, (_, i) => uniquePaths[i % 10]);
    const fullUrls = paths.map(path => `${servers[0].url}${path}`);

    bench('recker (no dedup)', async () => {
      await Promise.all(paths.map(path => recker.get(path).json()));
    });

    bench('recker (with dedup)', async () => {
      await Promise.all(paths.map(path => reckerWithDedup.get(path).json()));
    });

    bench('axios', async () => {
      await Promise.all(fullUrls.map(url => axios.get(url)));
    });

    bench('got', async () => {
      await Promise.all(fullUrls.map(url => got.get(url).json()));
    });

    bench('ky', async () => {
      await Promise.all(fullUrls.map(url => ky.get(url).json()));
    });
  });
});

// ============================================================================
// SCENARIO 7: Multi-Domain with Duplicates
// ============================================================================

summary(() => {
  group('Multi-Domain + Duplicates - 100 requests, 5 domains, 50% duplicates', () => {
    // 5 domains, 4 unique paths per domain = 20 unique URLs
    // 100 requests = 5 requests per unique URL on average
    const requests = Array.from({ length: 100 }, (_, i) => ({
      serverIndex: i % 5,
      path: `/mixed/${i % 4}`  // Only 4 unique paths per domain
    }));

    bench('recker (separate clients, no dedup)', async () => {
      const clients = servers.map(s => createClient({ baseUrl: s.url }));
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          clients[serverIndex].get(path).json()
        )
      );
    });

    bench('recker (separate clients, with dedup)', async () => {
      const clients = servers.map(s => createClient({ baseUrl: s.url, dedup: {} }));
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          clients[serverIndex].get(path).json()
        )
      );
    });

    bench('axios', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          axios.get(`${servers[serverIndex].url}${path}`)
        )
      );
    });

    bench('got', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          got.get(`${servers[serverIndex].url}${path}`).json()
        )
      );
    });

    bench('ky', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          ky.get(`${servers[serverIndex].url}${path}`).json()
        )
      );
    });
  });
});

// ============================================================================
// SCENARIO 8: Extreme Volume - 200 requests
// ============================================================================

summary(() => {
  group('Extreme Volume - 200 parallel requests, single domain', () => {
    const urls = Array.from({ length: 200 }, (_, i) => `/bulk/${i}`);
    const fullUrls = urls.map(path => `${servers[0].url}${path}`);

    bench('recker', async () => {
      await Promise.all(urls.map(path => recker.get(path).json()));
    });

    bench('axios', async () => {
      await Promise.all(fullUrls.map(url => axios.get(url)));
    });

    bench('got', async () => {
      await Promise.all(fullUrls.map(url => got.get(url).json()));
    });

    bench('ky', async () => {
      await Promise.all(fullUrls.map(url => ky.get(url).json()));
    });
  });
});

// ============================================================================
// SCENARIO 9: Extreme Multi-Domain - 200 requests across 5 domains
// ============================================================================

summary(() => {
  group('Extreme Multi-Domain - 200 requests across 5 domains', () => {
    const requests = Array.from({ length: 200 }, (_, i) => ({
      serverIndex: i % 5,
      path: `/extreme/${Math.floor(i / 5)}`
    }));

    bench('recker (separate clients)', async () => {
      const clients = servers.map(s => createClient({ baseUrl: s.url }));
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          clients[serverIndex].get(path).json()
        )
      );
    });

    bench('axios', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          axios.get(`${servers[serverIndex].url}${path}`)
        )
      );
    });

    bench('got', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          got.get(`${servers[serverIndex].url}${path}`).json()
        )
      );
    });

    bench('ky', async () => {
      await Promise.all(
        requests.map(({ serverIndex, path }) =>
          ky.get(`${servers[serverIndex].url}${path}`).json()
        )
      );
    });
  });
});

// Run benchmarks
await run({
  avg: true,
  json: false,
  colors: true,
  min_max: true,
  percentiles: true,
});

// Cleanup
console.log('\nCleaning up servers...');
for (const { server } of servers) {
  server.close();
}
console.log('Done!');
