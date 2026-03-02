/**
 * Proxy Rotator Plugin
 *
 * Convenience wrapper that sets `ClientOptions.proxy` to a list of proxies.
 * The actual round-robin rotation is handled natively by the transport layer.
 *
 * For most use cases, prefer setting `proxy` directly in `ClientOptions`:
 * ```typescript
 * const client = createClient({
 *   proxy: ['http://p1:8080', 'socks5://p2:1080', 'socks5h://p3:1080'],
 * });
 * ```
 */
import type { Plugin, ProxyOptions } from '../types/index.js';

export interface ProxyRotatorOptions {
  proxies: (string | ProxyOptions)[];
  strategy?: 'round-robin' | 'random';
  /** @deprecated Failover is not yet implemented. */
  failover?: boolean;
}

export function proxyRotatorPlugin(options: ProxyRotatorOptions): Plugin {
  return (client: any) => {
    // Set the proxy list on the client options directly.
    // The transport (UndiciTransport / CurlTransport) performs round-robin rotation.
    if (options.strategy === 'random') {
      // For random strategy, shuffle before assigning so the transport uses its own round-robin
      // on the already-shuffled list.
      const shuffled = [...options.proxies].sort(() => Math.random() - 0.5);
      client.defaults = client.defaults ?? {};
      client.defaults.proxy = shuffled;
    } else {
      client.defaults = client.defaults ?? {};
      client.defaults.proxy = options.proxies;
    }
  };
}
