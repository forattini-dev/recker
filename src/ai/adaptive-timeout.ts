/**
 * Adaptive Timeout Manager
 *
 * Learns from historical AI request latencies to set optimal timeouts.
 * AI requests are unique - first token can take time due to:
 * - Cold starts
 * - Queue times
 * - Model loading
 * - Thinking (reasoning models)
 *
 * After first token, responses stream quickly.
 */

import type { AITimeoutOptions } from '../types/ai.js';

/**
 * Latency sample for a model
 */
interface LatencySample {
  ttft: number;
  betweenTokens: number;
  total: number;
  timestamp: number;
}

/**
 * Model latency profile
 */
interface ModelProfile {
  samples: LatencySample[];
  avgTtft: number;
  avgBetweenTokens: number;
  avgTotal: number;
  p95Ttft: number;
  p95BetweenTokens: number;
  p95Total: number;
}

/**
 * Default timeout values (conservative)
 */
const DEFAULT_TIMEOUTS: Required<Omit<AITimeoutOptions, 'adaptive'>> = {
  firstToken: 60000,      // 60s - reasoning models can think
  betweenTokens: 10000,   // 10s - detect stalls
  total: 300000,          // 5min - long responses
};

/**
 * Timeout presets for known model types
 */
const MODEL_PRESETS: Record<string, Partial<AITimeoutOptions>> = {
  // Fast models
  'gpt-5.1-mini': { firstToken: 10000, betweenTokens: 2000, total: 60000 },
  'gpt-5.1-nano': { firstToken: 5000, betweenTokens: 1000, total: 30000 },
  'claude-haiku': { firstToken: 10000, betweenTokens: 2000, total: 60000 },

  // Standard models
  'gpt-5.1': { firstToken: 30000, betweenTokens: 5000, total: 120000 },
  'claude-sonnet': { firstToken: 30000, betweenTokens: 5000, total: 120000 },

  // Reasoning models (can think for a while)
  'o3': { firstToken: 120000, betweenTokens: 30000, total: 600000 },
  'o3-mini': { firstToken: 60000, betweenTokens: 15000, total: 300000 },
  'o4-mini': { firstToken: 60000, betweenTokens: 15000, total: 300000 },
  'claude-opus': { firstToken: 60000, betweenTokens: 10000, total: 300000 },

  // Embedding models (fast, no streaming)
  'text-embedding': { firstToken: 10000, betweenTokens: 0, total: 30000 },
};

/**
 * Adaptive Timeout Manager
 */
export class AdaptiveTimeoutManager {
  private profiles: Map<string, ModelProfile> = new Map();
  private maxSamples: number = 100;
  private sampleTtl: number = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Get timeout configuration for a model
   */
  getTimeouts(model: string, options?: AITimeoutOptions): Required<AITimeoutOptions> {
    // Start with defaults
    let timeouts = { ...DEFAULT_TIMEOUTS, adaptive: true };

    // Apply model preset if available
    const preset = this.findPreset(model);
    if (preset) {
      timeouts = { ...timeouts, ...preset };
    }

    // Apply learned profile if adaptive enabled
    if (options?.adaptive !== false) {
      const profile = this.profiles.get(model);
      if (profile && profile.samples.length >= 5) {
        // Use P95 values with 20% buffer
        timeouts.firstToken = Math.ceil(profile.p95Ttft * 1.2);
        timeouts.betweenTokens = Math.ceil(profile.p95BetweenTokens * 1.2);
        timeouts.total = Math.ceil(profile.p95Total * 1.2);
      }
    }

    // Apply user overrides
    if (options?.firstToken !== undefined) timeouts.firstToken = options.firstToken;
    if (options?.betweenTokens !== undefined) timeouts.betweenTokens = options.betweenTokens;
    if (options?.total !== undefined) timeouts.total = options.total;

    return timeouts;
  }

  /**
   * Record a latency sample
   */
  recordSample(model: string, ttft: number, betweenTokens: number, total: number): void {
    const sample: LatencySample = {
      ttft,
      betweenTokens,
      total,
      timestamp: Date.now(),
    };

    let profile = this.profiles.get(model);
    if (!profile) {
      profile = {
        samples: [],
        avgTtft: 0,
        avgBetweenTokens: 0,
        avgTotal: 0,
        p95Ttft: 0,
        p95BetweenTokens: 0,
        p95Total: 0,
      };
      this.profiles.set(model, profile);
    }

    // Add sample
    profile.samples.push(sample);

    // Cleanup old samples
    const cutoff = Date.now() - this.sampleTtl;
    profile.samples = profile.samples.filter((s) => s.timestamp > cutoff);

    // Limit sample count
    if (profile.samples.length > this.maxSamples) {
      profile.samples = profile.samples.slice(-this.maxSamples);
    }

    // Recalculate statistics
    this.recalculateStats(profile);
  }

  /**
   * Get profile for a model
   */
  getProfile(model: string): ModelProfile | undefined {
    return this.profiles.get(model);
  }

  /**
   * Clear all profiles
   */
  clear(): void {
    this.profiles.clear();
  }

  /**
   * Export profiles (for persistence)
   */
  export(): Record<string, LatencySample[]> {
    const data: Record<string, LatencySample[]> = {};
    for (const [model, profile] of this.profiles) {
      data[model] = profile.samples;
    }
    return data;
  }

  /**
   * Import profiles (from persistence)
   */
  import(data: Record<string, LatencySample[]>): void {
    for (const [model, samples] of Object.entries(data)) {
      const profile: ModelProfile = {
        samples,
        avgTtft: 0,
        avgBetweenTokens: 0,
        avgTotal: 0,
        p95Ttft: 0,
        p95BetweenTokens: 0,
        p95Total: 0,
      };
      this.recalculateStats(profile);
      this.profiles.set(model, profile);
    }
  }

  /**
   * Find preset for model
   */
  private findPreset(model: string): Partial<AITimeoutOptions> | undefined {
    // Exact match
    if (MODEL_PRESETS[model]) {
      return MODEL_PRESETS[model];
    }

    // Partial match (e.g., "gpt-5.1-mini-2025-01-01" matches "gpt-5.1-mini")
    const modelLower = model.toLowerCase();
    for (const [key, preset] of Object.entries(MODEL_PRESETS)) {
      if (modelLower.includes(key.toLowerCase())) {
        return preset;
      }
    }

    return undefined;
  }

  /**
   * Recalculate statistics for a profile
   */
  private recalculateStats(profile: ModelProfile): void {
    if (profile.samples.length === 0) return;

    // Calculate averages
    const ttfts = profile.samples.map((s) => s.ttft);
    const betweens = profile.samples.map((s) => s.betweenTokens);
    const totals = profile.samples.map((s) => s.total);

    profile.avgTtft = ttfts.reduce((a, b) => a + b, 0) / ttfts.length;
    profile.avgBetweenTokens = betweens.reduce((a, b) => a + b, 0) / betweens.length;
    profile.avgTotal = totals.reduce((a, b) => a + b, 0) / totals.length;

    // Calculate P95
    profile.p95Ttft = this.percentile(ttfts, 95);
    profile.p95BetweenTokens = this.percentile(betweens, 95);
    profile.p95Total = this.percentile(totals, 95);
  }

  /**
   * Calculate percentile
   */
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * Timeout controller for streaming responses
 *
 * Monitors time between chunks and aborts if stalled.
 */
export class StreamTimeoutController {
  private timeouts: Required<AITimeoutOptions>;
  private abortController: AbortController;
  private firstTokenTimer: ReturnType<typeof setTimeout> | null = null;
  private betweenTokenTimer: ReturnType<typeof setTimeout> | null = null;
  private totalTimer: ReturnType<typeof setTimeout> | null = null;
  private receivedFirstToken: boolean = false;
  private startTime: number;

  constructor(timeouts: Required<AITimeoutOptions>) {
    this.timeouts = timeouts;
    this.abortController = new AbortController();
    this.startTime = Date.now();
  }

  /**
   * Get abort signal
   */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Start the timeout tracking
   */
  start(): void {
    // First token timeout
    if (this.timeouts.firstToken > 0) {
      this.firstTokenTimer = setTimeout(() => {
        if (!this.receivedFirstToken) {
          this.abort('First token timeout exceeded');
        }
      }, this.timeouts.firstToken);
    }

    // Total timeout
    if (this.timeouts.total > 0) {
      this.totalTimer = setTimeout(() => {
        this.abort('Total timeout exceeded');
      }, this.timeouts.total);
    }
  }

  /**
   * Record received token/chunk
   */
  recordToken(): void {
    // First token received
    if (!this.receivedFirstToken) {
      this.receivedFirstToken = true;
      if (this.firstTokenTimer) {
        clearTimeout(this.firstTokenTimer);
        this.firstTokenTimer = null;
      }
    }

    // Reset between-token timer
    if (this.betweenTokenTimer) {
      clearTimeout(this.betweenTokenTimer);
    }

    if (this.timeouts.betweenTokens > 0) {
      this.betweenTokenTimer = setTimeout(() => {
        this.abort('Token stream stalled');
      }, this.timeouts.betweenTokens);
    }
  }

  /**
   * Mark stream complete
   */
  complete(): void {
    this.clearTimers();
  }

  /**
   * Abort the request
   */
  abort(reason: string): void {
    this.clearTimers();
    this.abortController.abort(new Error(reason));
  }

  /**
   * Get elapsed time
   */
  get elapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get time to first token
   */
  get ttft(): number | null {
    return this.receivedFirstToken ? Date.now() - this.startTime : null;
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.firstTokenTimer) {
      clearTimeout(this.firstTokenTimer);
      this.firstTokenTimer = null;
    }
    if (this.betweenTokenTimer) {
      clearTimeout(this.betweenTokenTimer);
      this.betweenTokenTimer = null;
    }
    if (this.totalTimer) {
      clearTimeout(this.totalTimer);
      this.totalTimer = null;
    }
  }
}

/**
 * Global adaptive timeout manager instance
 */
export const adaptiveTimeouts = new AdaptiveTimeoutManager();
