/**
 * ProxyAdapter - Pluggable proxy selection for the Spider.
 *
 * Users implement this interface to control which proxy is used per-request.
 * Enables health-based rotation, geo-routing, API-based proxy pools, etc.
 */

export interface ProxyAdapter {
  /** Return the next proxy URL to use, or null for direct connection */
  getProxy(): Promise<string | null>;
  /** Optional: report whether the proxy worked (for health tracking) */
  reportResult?(proxy: string, success: boolean): Promise<void>;
  /** Optional: graceful shutdown */
  close?(): Promise<void>;
}

/**
 * Round-robin proxy adapter from a static list.
 * Default implementation when a string[] is passed.
 */
export class ListProxyAdapter implements ProxyAdapter {
  private index = 0;

  constructor(private readonly proxies: string[]) {
    if (proxies.length === 0) {
      throw new Error('ListProxyAdapter requires at least one proxy');
    }
  }

  async getProxy(): Promise<string> {
    const proxy = this.proxies[this.index % this.proxies.length];
    this.index++;
    return proxy;
  }

  async close(): Promise<void> {
    // no-op
  }
}
