import { Plugin, ReckerRequest } from '../types/index.js';
import { ProxyAgent } from 'undici';

export interface ProxyRotatorOptions {
  proxies: string[];
  strategy?: 'round-robin' | 'random';
  /** Remove proxy from rotation on error? */
  failover?: boolean; 
}

export function proxyRotator(options: ProxyRotatorOptions): Plugin {
  const proxies = options.proxies.map(url => ({
    url,
    agent: new ProxyAgent(url),
    failures: 0
  }));
  
  let index = 0;

  const getNextProxy = () => {
    if (proxies.length === 0) return null;

    let selected;
    if (options.strategy === 'random') {
      selected = proxies[Math.floor(Math.random() * proxies.length)];
    } else {
      // Round-robin
      selected = proxies[index];
      index = (index + 1) % proxies.length;
    }
    return selected;
  };

  return (client: any) => {
    // We need to hook into the dispatch phase to override the dispatcher (agent).
    // But Client currently sets transport once.
    // Undici request options accepts 'dispatcher'. 
    // We need a way to inject 'dispatcher' into the request options passed to UndiciTransport.
    
    // Currently, UndiciTransport uses `this.proxyAgent` or `this.options.dispatcher`.
    // It DOES NOT read dispatcher from `req`.
    
    // Refactor required: UndiciTransport should check `req.dispatcher` or `req.agent` context.
    // Let's attach the agent to the request object (simulated via internal property).
    
    client.beforeRequest((req: ReckerRequest) => {
      const proxy = getNextProxy();
      if (proxy) {
        // Attach agent to request. We need to cast to any or update types.
        (req as any)._dispatcher = proxy.agent;
        // Tag request for later error handling
        (req as any)._proxyUrl = proxy.url;
      }
    });

    client.onError((err: Error, req: ReckerRequest) => {
        if (options.failover && (req as any)._proxyUrl) {
            // Mark failure logic here (remove from pool, etc)
            // For simplicity, we just log or could filter out bad proxies in future calls
        }
    });
  };
}
