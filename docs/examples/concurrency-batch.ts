// Concurrency & Batch Request Examples for Recker HTTP Client

import { createClient } from 'recker';

// ======================
// Simple Global Concurrency
// ======================
const client1 = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: 20  // Max 20 concurrent requests globally
});

// Execute batch requests
const { results, stats } = await client1.batch([
  { path: '/users/1' },
  { path: '/users/2' },
  { path: '/users/3' }
], {
  concurrency: 5,  // Batch-specific limit
  mapResponse: (res) => res.json()  // Auto-transform
});

console.log(`Completed ${stats.successful}/${stats.total} in ${stats.duration}ms`);

// ======================
// Rate Limiting
// ======================
const client2 = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 50,                    // Max 50 concurrent
    requestsPerInterval: 100,   // Start max 100 req/sec
    interval: 1000
  }
});

const requests = Array.from({ length: 1000 }, (_, i) => ({
  path: `/items/${i}`
}));

await client2.batch(requests);

// ======================
// Multi-Domain Batches
// ======================
const client3 = createClient({
  baseUrl: 'https://example.com',
  concurrency: {
    max: 30,
    agent: {
      perDomainPooling: true  // Separate pools per domain
    }
  }
});

const multiDomainRequests = [
  { path: 'https://api1.com/data' },
  { path: 'https://api2.com/data' },
  { path: 'https://api3.com/data' },
  { path: 'https://api1.com/more' },
  { path: 'https://api2.com/more' },
  { path: 'https://api3.com/more' }
];

await client3.batch(multiDomainRequests);
// Each domain gets its own connection pool
// api1.com won't block api2.com or api3.com

// ======================
// Web Scraping Multiple Sites
// ======================
const client4 = createClient({
  concurrency: {
    runner: { concurrency: 20 },  // Each batch: 20 concurrent
    agent: {
      perDomainPooling: true
    }
  }
});

const siteA = Array.from({ length: 100 }, (_, i) => ({
  path: `https://site-a.com/page/${i}`
}));

const siteB = Array.from({ length: 100 }, (_, i) => ({
  path: `https://site-b.com/page/${i}`
}));

// Scrape both sites in parallel (40 concurrent total)
const [resultsA, resultsB] = await Promise.all([
  client4.batch(siteA, { concurrency: 20 }),
  client4.batch(siteB, { concurrency: 20 })
]);
