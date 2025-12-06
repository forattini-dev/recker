const __DIST_DIR__ = '/home/cyber/Work/tetis/recker/dist';

const results = {
  compressionWorked: false,
  spaceSaved: 0,
  finalMemory: 0,
  error: null,
};

try {
  const { MemoryStorage } = await import(__DIST_DIR__ + '/cache/memory-storage.js');

  const cache = new MemoryStorage({
    maxMemoryBytes: 10 * 1024 * 1024, // 10MB
    compression: { enabled: true, threshold: 100 },
    monitorInterval: 0,
    cleanupInterval: 0,
  });

  // Add highly compressible data
  for (let i = 0; i < 100; i++) {
    await cache.set(`key${i}`, {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: 'abcdefghij'.repeat(5000), // 50KB of repeated pattern
      timestamp: Date.now(),
    }, 60000);
  }

  const compressionStats = cache.getCompressionStats();
  const memStats = cache.getMemoryStats();

  results.compressionWorked = compressionStats.compressedItems > 0;
  results.spaceSaved = parseFloat(compressionStats.spaceSavingsPercent) || 0;
  results.finalMemory = memStats.currentMemoryBytes;

  cache.shutdown();
} catch (err) {
  results.error = err.message;
}

console.log(JSON.stringify(results));
