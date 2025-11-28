// Caching & Retry Examples for Recker HTTP Client

import { createClient } from 'recker';

// ======================
// Simple Cache-First
// ======================
const client1 = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    driver: 'memory',
    ttl: 60_000 // 1 minute
  }
});

// First request: network
const data1 = await client1.get('/users').json();

// Second request: cache (instant)
const data2 = await client1.get('/users').json();

// ======================
// Stale-While-Revalidate
// ======================
const client2 = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    driver: 'memory',
    strategy: 'stale-while-revalidate',
    ttl: 60_000
  }
});

// Returns stale data immediately, fetches fresh data in background
const staleData = await client2.get('/users').json();

// ======================
// Smart Retry
// ======================
const client3 = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 3,
    delay: 1000,
    backoff: 'exponential', // 'exponential' | 'linear' | 'decorrelated'
    retryableStatusCodes: [408, 429, 500, 502, 503, 504]
  }
});

// Automatically retries on 5xx errors with exponential backoff
const resilientData = await client3.get('/flaky-endpoint').json();

// ======================
// Request Deduplication
// ======================
const client4 = createClient({
  baseUrl: 'https://api.example.com',
  dedup: true // Deduplicate parallel identical requests
});

// These 3 parallel requests will only make 1 network call
const [res1, res2, res3] = await Promise.all([
  client4.get('/users').json(),
  client4.get('/users').json(),
  client4.get('/users').json()
]);

console.log('All 3 results are identical:', res1 === res2 && res2 === res3);
