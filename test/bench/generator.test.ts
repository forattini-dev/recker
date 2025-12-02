import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoadGenerator } from '../../src/bench/generator.js';
import { ReckerResponse } from '../../src/types/index.js';

// Mock the entire client module
const mockGet = vi.fn();
vi.mock('../../src/core/client.js', () => ({
  createClient: () => ({
    get: mockGet
  })
}));

describe('LoadGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should run multiple requests in user loop', async () => {
    // Setup mock to return a valid response with delay
    mockGet.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 1)); // Simulate 1ms network latency
      return {
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        text: async () => 'body', // Mock consuming body
      };
    });

    const generator = new LoadGenerator({
      url: 'http://example.com',
      users: 2,
      duration: 0.5, // 500ms
      mode: 'throughput',
      rampUp: 0
    });

    // Start generator
    await generator.start();

    expect(mockGet).toHaveBeenCalled();
    expect(generator.stats.totalRequests).toBeGreaterThan(2);
    expect(generator.stats.successful).toBeGreaterThan(0);
  });

  it('should handle request failures', async () => {
    mockGet.mockRejectedValue(new Error('Network Error'));

    const generator = new LoadGenerator({
      url: 'http://example.com',
      users: 1,
      duration: 0.5,
      mode: 'stress'
    });

    await generator.start();

    expect(generator.stats.failed).toBeGreaterThan(0);
  });
});
