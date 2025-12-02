/**
 * Error entry with status code and count
 */
export interface ErrorEntry {
  status: number;      // HTTP status code (0 for network errors)
  message: string;     // Error message
  count: number;       // How many times this error occurred
  lastSeen: number;    // Timestamp of last occurrence
}

export class LoadStats {
  totalRequests = 0;
  successful = 0;
  failed = 0;
  bytesTransferred = 0;

  statusCodes: Record<number, number> = {};

  /**
   * Errors indexed by "status:message" key for deduplication
   */
  private errorMap = new Map<string, ErrorEntry>();

  /**
   * Recent errors for real-time display (last N unique errors)
   */
  private recentErrors: ErrorEntry[] = [];
  private readonly maxRecentErrors = 10;

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
      this.trackError(status, error);
    } else {
      this.successful++;
    }

    if (status) {
      this.statusCodes[status] = (this.statusCodes[status] || 0) + 1;
    }
  }

  /**
   * Track an error with its status code
   */
  private trackError(status: number, error?: Error) {
    const message = this.formatErrorMessage(status, error);
    const key = `${status}:${message}`;
    const now = Date.now();

    const existing = this.errorMap.get(key);
    if (existing) {
      existing.count++;
      existing.lastSeen = now;
    } else {
      const entry: ErrorEntry = { status, message, count: 1, lastSeen: now };
      this.errorMap.set(key, entry);

      // Add to recent errors (keep most recent at the end)
      this.recentErrors.push(entry);
      if (this.recentErrors.length > this.maxRecentErrors) {
        this.recentErrors.shift();
      }
    }
  }

  /**
   * Format error message with status code context
   */
  private formatErrorMessage(status: number, error?: Error): string {
    if (error) {
      // Clean up common error messages
      let msg = error.message || 'Unknown Error';

      // Extract useful info from common errors
      if (msg.includes('ECONNREFUSED')) return 'Connection refused';
      if (msg.includes('ECONNRESET')) return 'Connection reset';
      if (msg.includes('ETIMEDOUT')) return 'Connection timeout';
      if (msg.includes('ENOTFOUND')) return 'DNS lookup failed';
      if (msg.includes('UND_ERR_SOCKET')) return 'Socket error';
      if (msg.includes('UND_ERR_HEADERS_TIMEOUT')) return 'Headers timeout';
      if (msg.includes('UND_ERR_BODY_TIMEOUT')) return 'Body timeout';
      if (msg.includes('UND_ERR_CONNECT_TIMEOUT')) return 'Connect timeout';
      if (msg.includes('AbortError') || msg.includes('aborted')) return 'Request aborted';

      // Truncate long messages
      if (msg.length > 50) {
        msg = msg.substring(0, 47) + '...';
      }
      return msg;
    }

    // HTTP status code without explicit error
    if (status >= 400) {
      return this.getStatusText(status);
    }

    return 'Unknown Error';
  }

  /**
   * Get compact status text (CamelCase, no spaces)
   */
  private getStatusText(status: number): string {
    const texts: Record<number, string> = {
      400: 'BadRequest',
      401: 'Unauthorized',
      402: 'PaymentRequired',
      403: 'Forbidden',
      404: 'NotFound',
      405: 'MethodNotAllowed',
      406: 'NotAcceptable',
      407: 'ProxyAuthRequired',
      408: 'RequestTimeout',
      409: 'Conflict',
      410: 'Gone',
      411: 'LengthRequired',
      412: 'PreconditionFailed',
      413: 'PayloadTooLarge',
      414: 'URITooLong',
      415: 'UnsupportedMediaType',
      416: 'RangeNotSatisfiable',
      417: 'ExpectationFailed',
      418: 'Teapot',
      421: 'MisdirectedRequest',
      422: 'UnprocessableEntity',
      423: 'Locked',
      424: 'FailedDependency',
      425: 'TooEarly',
      426: 'UpgradeRequired',
      428: 'PreconditionRequired',
      429: 'TooManyRequests',
      431: 'HeaderFieldsTooLarge',
      451: 'UnavailableForLegalReasons',
      500: 'InternalServerError',
      501: 'NotImplemented',
      502: 'BadGateway',
      503: 'ServiceUnavailable',
      504: 'GatewayTimeout',
      505: 'HTTPVersionNotSupported',
      506: 'VariantAlsoNegotiates',
      507: 'InsufficientStorage',
      508: 'LoopDetected',
      510: 'NotExtended',
      511: 'NetworkAuthRequired',
    };
    return texts[status] || `HTTP${status}`;
  }

  /**
   * Get all errors sorted by count (descending)
   */
  getErrors(): ErrorEntry[] {
    return Array.from(this.errorMap.values())
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get recent errors for real-time display
   */
  getRecentErrors(): ErrorEntry[] {
    return [...this.recentErrors];
  }

  /**
   * Legacy errors property for backwards compatibility
   */
  get errors(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const entry of this.errorMap.values()) {
      const key = entry.status > 0 ? `[${entry.status}] ${entry.message}` : entry.message;
      result[key] = entry.count;
    }
    return result;
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
