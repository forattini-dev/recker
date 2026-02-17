const __DIST_DIR__ = '/home/cyber/Work/tetis/libs/recker/dist';

const { MemoryStorage } = await import(__DIST_DIR__ + '/cache/memory-storage.js');

const results = {
  evictions: 0,
  pressureEvents: 0,
  finalMemory: 0,
  finalItems: 0,
  success: false,
  error: null,
};

try {
  const cache = new MemoryStorage({
    maxMemoryBytes: 20 * 1024 * 1024, // 20MB limit
    evictionPolicy: 'lru',
    monitorInterval: 100,
    cleanupInterval: 0,
    heapUsageThreshold: 0.7, // More aggressive
    onEvict: () => results.evictions++,
    onPressure: () => results.pressureEvents++,
  });

  // Fill cache aggressively
  for (let i = 0; i < 500; i++) {
    await cache.set(`key${i}`, {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: 'x'.repeat(50000), // 50KB each
      timestamp: Date.now(),
    }, 60000);
  }

  // Wait for health check to run
  await new Promise(r => setTimeout(r, 200));

  const stats = cache.getMemoryStats();
  results.finalMemory = stats.currentMemoryBytes;
  results.finalItems = stats.totalItems;
  results.success = stats.currentMemoryBytes <= 20 * 1024 * 1024;

  cache.shutdown();
} catch (err) {
  results.error = err.message;
}

console.log(JSON.stringify(results));
