import { Plugin, ReckerRequest } from '../types/index.js';
import { Agent } from 'undici';
import { networkInterfaces } from 'node:os';

export interface InterfaceRotatorOptions {
  /** 
   * Strategy to select interface 
   * @default 'round-robin'
   */
  strategy?: 'round-robin' | 'random';
  
  /**
   * Filter interfaces by name (regex or string)
   * e.g. 'eth0' or /^eth/
   */
  interface?: string | RegExp;

  /**
   * Filter by IP family
   * @default 'IPv4'
   */
  family?: 'IPv4' | 'IPv6' | 'both';

  /**
   * Exclude internal/loopback addresses?
   * @default true
   */
  excludeInternal?: boolean;

  /**
   * Manually provide list of IPs to use
   * If provided, auto-discovery is skipped
   */
  ips?: string[];
}

export function interfaceRotatorPlugin(options: InterfaceRotatorOptions = {}): Plugin {
  const strategy = options.strategy || 'round-robin';
  const familyFilter = options.family || 'IPv4';
  const excludeInternal = options.excludeInternal !== false;

  let ips: string[] = options.ips || [];

  // Auto-discovery if no IPs provided
  if (ips.length === 0) {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      // Check interface name filter
      if (options.interface) {
        if (typeof options.interface === 'string' && name !== options.interface) continue;
        if (options.interface instanceof RegExp && !options.interface.test(name)) continue;
      }

      const netInfo = nets[name];
      if (!netInfo) continue;

      for (const net of netInfo) {
        // Filter internal
        if (excludeInternal && net.internal) continue;

        // Filter family
        if (familyFilter !== 'both' && net.family !== familyFilter) continue;

        ips.push(net.address);
      }
    }
  }

  if (ips.length === 0) {
    // No valid interfaces found, plugin inactive (no-op)
    return () => {};
  }

  // Create an Agent for each IP
  const agents = ips.map(ip => ({
    ip,
    agent: new Agent({
      connect: {
        localAddress: ip,
        // Inherit defaults or allow config? 
        // ideally we should clone global settings but we don't have access here easily.
        // Using safe defaults.
        keepAlive: true,
        timeout: 10000
      }
    })
  }));

  let index = 0;

  return (client: any) => {
    client.beforeRequest((req: ReckerRequest) => {
      let selected;
      
      if (strategy === 'random') {
        selected = agents[Math.floor(Math.random() * agents.length)];
      } else {
        selected = agents[index];
        index = (index + 1) % agents.length;
      }

      // Inject dispatcher to override transport behavior
      // Using the same mechanism as proxyRotator
      (req as any)._dispatcher = selected.agent;
      
      // Optional: Tag request for debugging
      (req as any)._localAddress = selected.ip;
    });
  };
}
