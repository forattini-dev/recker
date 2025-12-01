/**
 * Isolated Memory Pressure Tests
 *
 * These tests run in a separate process with limited heap size to safely
 * test memory pressure behavior without affecting the main test suite
 * or the user's system.
 *
 * Run with: node --max-old-space-size=64 scripts/test-memory-pressure.mjs
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';

const SCRIPT_DIR = join(process.cwd(), 'test', 'scripts');
const DIST_DIR = join(process.cwd(), 'dist');
const TIMEOUT = 30000; // 30 seconds max per test

// Ensure scripts directory exists
if (!existsSync(SCRIPT_DIR)) {
  mkdirSync(SCRIPT_DIR, { recursive: true });
}

/**
 * Run a script in an isolated process with memory limits
 */
async function runIsolated(
  script: string,
  maxHeapMB: number = 64
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const scriptPath = join(SCRIPT_DIR, `temp-${Date.now()}.mjs`);

  // Inject the correct dist path into the script
  const fullScript = `const __DIST_DIR__ = '${DIST_DIR}';\n${script}`;

  // Write script to temp file
  writeFileSync(scriptPath, fullScript, 'utf8');

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [`--max-old-space-size=${maxHeapMB}`, scriptPath],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' },
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Test timed out'));
    }, TIMEOUT);

    child.on('close', (code) => {
      clearTimeout(timeout);
      // Clean up temp file
      try {
        unlinkSync(scriptPath);
      } catch {}
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      try {
        unlinkSync(scriptPath);
      } catch {}
      reject(err);
    });
  });
}

describe('Isolated Memory Pressure Tests', () => {
  it('should handle memory pressure in 64MB heap', async () => {
    const script = `
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
    await cache.set(\`key\${i}\`, {
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
`;

    const { stdout, stderr, exitCode } = await runIsolated(script, 64);

    // Parse results
    let results;
    try {
      const jsonLine = stdout.trim().split('\n').pop() || '{}';
      results = JSON.parse(jsonLine);
    } catch {
      console.error('stdout:', stdout);
      console.error('stderr:', stderr);
      throw new Error('Failed to parse test output');
    }

    expect(results.error).toBeNull();
    expect(results.success).toBe(true);
    expect(results.evictions).toBeGreaterThan(0);
    console.log(`    Evictions: ${results.evictions}`);
    console.log(`    Final items: ${results.finalItems}`);
    console.log(`    Final memory: ${(results.finalMemory / 1024 / 1024).toFixed(2)} MB`);
  });

  it('should survive heap pressure without OOM', async () => {
    const script = `
const results = {
  survived: false,
  heapPressureDetected: false,
  heapRatio: 0,
  error: null,
};

try {
  const { MemoryStorage } = await import(__DIST_DIR__ + '/cache/memory-storage.js');
  const { getHeapStats } = await import(__DIST_DIR__ + '/cache/memory-limits.js');

  const cache = new MemoryStorage({
    maxMemoryBytes: 10 * 1024 * 1024, // 10MB
    heapUsageThreshold: 0.5, // Very aggressive - 50%
    monitorInterval: 50,
    cleanupInterval: 0,
    onPressure: () => {
      results.heapPressureDetected = true;
    },
  });

  // Rapid insertions to stress heap
  for (let i = 0; i < 1000; i++) {
    await cache.set(\`k\${i}\`, {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: 'data'.repeat(1000),
      timestamp: Date.now(),
    }, 60000);
  }

  // Check heap
  const heapStats = getHeapStats();

  // If we get here, we survived
  results.survived = true;
  results.heapRatio = heapStats.heapRatio;

  cache.shutdown();
} catch (err) {
  results.error = err.message;
}

console.log(JSON.stringify(results));
`;

    const { stdout, stderr, exitCode } = await runIsolated(script, 48);

    let results;
    try {
      const jsonLine = stdout.trim().split('\n').pop() || '{}';
      results = JSON.parse(jsonLine);
    } catch {
      console.error('stdout:', stdout);
      console.error('stderr:', stderr);
      throw new Error('Failed to parse test output');
    }

    // Should survive (not OOM)
    expect(results.survived).toBe(true);
    expect(results.error).toBeNull();
    console.log(`    Heap pressure detected: ${results.heapPressureDetected}`);
    console.log(`    Final heap ratio: ${(results.heapRatio * 100).toFixed(1)}%`);
  });

  it('should enforce maxMemoryBytes under pressure', async () => {
    const script = `
const results = {
  memoryWithinLimit: false,
  maxMemoryBytes: 5 * 1024 * 1024,
  finalMemory: 0,
  error: null,
};

try {
  const { MemoryStorage } = await import(__DIST_DIR__ + '/cache/memory-storage.js');

  const cache = new MemoryStorage({
    maxMemoryBytes: results.maxMemoryBytes, // 5MB
    maxSize: 10000,
    evictionPolicy: 'lru',
    monitorInterval: 0,
    cleanupInterval: 0,
  });

  // Try to add 50MB of data
  for (let i = 0; i < 500; i++) {
    await cache.set(\`key\${i}\`, {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: 'x'.repeat(100000), // 100KB each = 50MB total
      timestamp: Date.now(),
    }, 60000);
  }

  const stats = cache.getMemoryStats();
  results.finalMemory = stats.currentMemoryBytes;
  results.memoryWithinLimit = stats.currentMemoryBytes <= results.maxMemoryBytes;

  cache.shutdown();
} catch (err) {
  results.error = err.message;
}

console.log(JSON.stringify(results));
`;

    const { stdout, stderr, exitCode } = await runIsolated(script, 128);

    let results;
    try {
      const jsonLine = stdout.trim().split('\n').pop() || '{}';
      results = JSON.parse(jsonLine);
    } catch {
      console.error('stdout:', stdout);
      console.error('stderr:', stderr);
      throw new Error('Failed to parse test output');
    }

    expect(results.error).toBeNull();
    expect(results.memoryWithinLimit).toBe(true);
    console.log(`    Memory limit: ${(results.maxMemoryBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`    Final memory: ${(results.finalMemory / 1024 / 1024).toFixed(2)} MB`);
  });

  it('should handle compression under memory pressure', async () => {
    const script = `
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
    await cache.set(\`key\${i}\`, {
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
`;

    const { stdout, stderr, exitCode } = await runIsolated(script, 96);

    let results;
    try {
      const jsonLine = stdout.trim().split('\n').pop() || '{}';
      results = JSON.parse(jsonLine);
    } catch {
      console.error('stdout:', stdout);
      console.error('stderr:', stderr);
      throw new Error('Failed to parse test output');
    }

    expect(results.error).toBeNull();
    expect(results.compressionWorked).toBe(true);
    expect(results.spaceSaved).toBeGreaterThan(50); // Should save at least 50%
    console.log(`    Space saved: ${results.spaceSaved}%`);
    console.log(`    Final memory: ${(results.finalMemory / 1024 / 1024).toFixed(2)} MB`);
  });

  it('should not crash with maxMemoryPercent in limited heap', async () => {
    const script = `
const results = {
  success: false,
  calculatedLimit: 0,
  error: null,
};

try {
  const { MemoryStorage } = await import(__DIST_DIR__ + '/cache/memory-storage.js');

  // 10% of effective memory (should be capped by heap limit)
  const cache = new MemoryStorage({
    maxMemoryPercent: 0.1,
    monitorInterval: 0,
    cleanupInterval: 0,
  });

  const stats = cache.getMemoryStats();
  results.calculatedLimit = stats.maxMemoryBytes;
  results.success = stats.maxMemoryBytes > 0;

  // Add some data
  for (let i = 0; i < 100; i++) {
    await cache.set(\`key\${i}\`, {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: 'test data ' + i,
      timestamp: Date.now(),
    }, 60000);
  }

  cache.shutdown();
} catch (err) {
  results.error = err.message;
}

console.log(JSON.stringify(results));
`;

    const { stdout, stderr, exitCode } = await runIsolated(script, 64);

    let results;
    try {
      const jsonLine = stdout.trim().split('\n').pop() || '{}';
      results = JSON.parse(jsonLine);
    } catch {
      console.error('stdout:', stdout);
      console.error('stderr:', stderr);
      throw new Error('Failed to parse test output');
    }

    expect(results.error).toBeNull();
    expect(results.success).toBe(true);
    console.log(`    Calculated limit: ${(results.calculatedLimit / 1024 / 1024).toFixed(2)} MB`);
  });
});

describe('Memory Behavior Verification', () => {
  it('should report accurate memory stats without pressure', async () => {
    const script = `
const results = {
  memoryTracking: [],
  error: null,
};

try {
  const { MemoryStorage } = await import(__DIST_DIR__ + '/cache/memory-storage.js');

  const cache = new MemoryStorage({
    maxMemoryBytes: 50 * 1024 * 1024,
    monitorInterval: 0,
    cleanupInterval: 0,
  });

  // Track memory at each step
  results.memoryTracking.push({ step: 'initial', bytes: cache.getMemoryStats().currentMemoryBytes });

  // Add entries
  for (let i = 0; i < 10; i++) {
    await cache.set(\`key\${i}\`, {
      status: 200,
      statusText: 'OK',
      headers: {},
      body: 'x'.repeat(1000),
      timestamp: Date.now(),
    }, 60000);
  }
  results.memoryTracking.push({ step: 'after_10_adds', bytes: cache.getMemoryStats().currentMemoryBytes });

  // Delete some
  for (let i = 0; i < 5; i++) {
    await cache.delete(\`key\${i}\`);
  }
  results.memoryTracking.push({ step: 'after_5_deletes', bytes: cache.getMemoryStats().currentMemoryBytes });

  // Clear
  cache.clear();
  results.memoryTracking.push({ step: 'after_clear', bytes: cache.getMemoryStats().currentMemoryBytes });

  cache.shutdown();
} catch (err) {
  results.error = err.message;
}

console.log(JSON.stringify(results));
`;

    const { stdout, stderr, exitCode } = await runIsolated(script, 128);

    let results;
    try {
      const jsonLine = stdout.trim().split('\n').pop() || '{}';
      results = JSON.parse(jsonLine);
    } catch {
      console.error('stdout:', stdout);
      console.error('stderr:', stderr);
      throw new Error('Failed to parse test output');
    }

    expect(results.error).toBeNull();

    const tracking = results.memoryTracking;
    expect(tracking[0].bytes).toBe(0); // Initial
    expect(tracking[1].bytes).toBeGreaterThan(0); // After adds
    expect(tracking[2].bytes).toBeLessThan(tracking[1].bytes); // After deletes
    expect(tracking[3].bytes).toBe(0); // After clear

    console.log('    Memory tracking:');
    for (const { step, bytes } of tracking) {
      console.log(`      ${step}: ${bytes} bytes`);
    }
  });
});
