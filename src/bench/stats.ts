export class LoadStats {
  totalRequests = 0;
  successful = 0;
  failed = 0;
  bytesTransferred = 0;
  
  statusCodes: Record<number, number> = {};
  errors: Record<string, number> = {};
  
  // Latency tracking (ms)
  latencies: number[] = [];
  
  // Snapshot for RPS calculation
  private lastSnapshotTime = Date.now();
  private lastSnapshotRequests = 0;
  
  // Real-time metric
  activeUsers = 0;

  addResult(durationMs: number, status: number, bytes: number, error?: Error) {
    this.totalRequests++;
    this.bytesTransferred += bytes;
    this.latencies.push(durationMs);

    if (error || status >= 400) {
      this.failed++;
      if (error) {
        const msg = error.message || 'Unknown Error';
        this.errors[msg] = (this.errors[msg] || 0) + 1;
      }
    } else {
      this.successful++;
    }

    if (status) {
      this.statusCodes[status] = (this.statusCodes[status] || 0) + 1;
    }
  }

  getSnapshot() {
    const now = Date.now();
    const timeDiff = (now - this.lastSnapshotTime) / 1000; // seconds
    const reqDiff = this.totalRequests - this.lastSnapshotRequests;
    
    const rps = reqDiff / timeDiff;
    
    this.lastSnapshotTime = now;
    this.lastSnapshotRequests = this.totalRequests;

    // Calculate recent latency (last N requests or simple avg of recent)
    // For dashboard, we want recent P95
    const recentLatencies = this.latencies.slice(-reqDiff);
    recentLatencies.sort((a, b) => a - b);
    const p95 = recentLatencies[Math.floor(recentLatencies.length * 0.95)] || 0;

    return { rps, p95, activeUsers: this.activeUsers };
  }

  getSummary() {
    this.latencies.sort((a, b) => a - b);
    const avg = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length || 0;
    const p50 = this.latencies[Math.floor(this.latencies.length * 0.50)] || 0;
    const p95 = this.latencies[Math.floor(this.latencies.length * 0.95)] || 0;
    const p99 = this.latencies[Math.floor(this.latencies.length * 0.99)] || 0;
    const max = this.latencies[this.latencies.length - 1] || 0;

    return {
      total: this.totalRequests,
      success: this.successful,
      failed: this.failed,
      bytes: this.bytesTransferred,
      rps: Math.round(this.totalRequests / ((Date.now() - this.latencies[0]) / 1000) || 0), // Rough approx if not stored start time
      latency: { avg, p50, p95, p99, max },
      codes: this.statusCodes,
      errors: this.errors
    };
  }
}
