/**
 * Recker Plugins
 *
 * Collection of middleware plugins to extend client functionality.
 * Import directly from here for better DevX.
 *
 * @example
 * ```typescript
 * import { rateLimitPlugin, basicAuthPlugin } from 'recker/plugins';
 *
 * client.use(rateLimitPlugin({ limit: 10 }));
 * client.use(basicAuthPlugin({ username: 'user', password: 'pass' }));
 * ```
 */

// Authentication
export * from './auth/index.js';

// Resilience & Performance
export { retryPlugin, type RetryOptions } from './retry.js';
export { circuitBreakerPlugin, type CircuitBreakerOptions, CircuitBreakerError } from './circuit-breaker.js';
export { rateLimitPlugin, type RateLimitOptions, RateLimitExceededError } from './rate-limit.js';
export { cachePlugin, type CacheOptions } from './cache.js';
export { dedupPlugin, type DedupOptions } from './dedup.js';
export { compression } from './compression.js';

// Observability
export { loggerPlugin, type LoggerPluginOptions as LoggerOptions } from './logger.js';
export { serverTimingPlugin } from './server-timing.js';
export { harRecorderPlugin } from './har-recorder.js';
export { harPlayerPlugin } from './har-player.js';

// Security
export { xsrfPlugin, type XSRFPluginOptions as XsrfOptions } from './xsrf.js';
export { certificatePinning, certificatePinningPlugin, type CertificatePinningOptions } from './certificate-pinning.js';

// Data & Formats
export { parseXML, serializeXML } from './xml.js';
export { soap, type SoapOptions } from './soap.js';
export { graphqlPlugin, type GraphQLOptions as GraphqlOptions } from './graphql.js';
export { jsonrpc } from './jsonrpc.js';
export { odata, type ODataOptions } from './odata.js';

// Network & Protocol
export { proxyRotatorPlugin, type ProxyRotatorOptions } from './proxy-rotator.js';
export { interfaceRotatorPlugin } from './interface-rotator.js';
export { userAgentRotatorPlugin, type UserAgentOptions } from './user-agent.js';
export { cookieJarPlugin } from './cookie-jar.js';
export { hls, type HlsOptions } from './hls.js';
export { http2Push } from './http2-push.js';
export { http3 } from './http3.js';
export { grpcWeb } from './grpc-web.js';
export { scrape, type ScrapeOptions } from './scrape.js';
