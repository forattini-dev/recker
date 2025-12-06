/**
 * Recker Plugins
 * 
 * Collection of middleware plugins to extend client functionality.
 * Import directly from here for better DevX.
 * 
 * @example
 * ```typescript
 * import { rateLimit, basicAuth } from 'recker/plugins';
 * 
 * client.use(rateLimit({ limit: 10 }));
 * client.use(basicAuth({ username: 'user', password: 'pass' }));
 * ```
 */

// Authentication
export * from './auth/index.js';

// Resilience & Performance
export { retry, type RetryOptions } from './retry.js';
export { circuitBreaker, type CircuitBreakerOptions, CircuitBreakerError } from './circuit-breaker.js';
export { rateLimit, type RateLimitOptions, RateLimitExceededError } from './rate-limit.js';
export { cache, type CacheOptions } from './cache.js';
export { dedup, type DedupOptions } from './dedup.js';
export { compression } from './compression.js';

// Observability
export { logger, type LoggerPluginOptions as LoggerOptions } from './logger.js';
export { serverTiming } from './server-timing.js';
export { harRecorder } from './har-recorder.js';
export { harPlayer } from './har-player.js';

// Security
export { xsrf, type XSRFPluginOptions as XsrfOptions } from './xsrf.js';
export { certificatePinning, type CertificatePinningOptions } from './certificate-pinning.js';

// Data & Formats
export { parseXML, serializeXML } from './xml.js';
export { soap, type SoapOptions } from './soap.js';
export { graphql, type GraphQLOptions as GraphqlOptions } from './graphql.js';
export { jsonrpc } from './jsonrpc.js';
export { odata, type ODataOptions } from './odata.js';

// Network & Protocol
export { proxyRotator, type ProxyRotatorOptions } from './proxy-rotator.js';
export { interfaceRotator } from './interface-rotator.js';
export { userAgentRotator as userAgent, type UserAgentOptions } from './user-agent.js';
export { cookieJar } from './cookie-jar.js';
export { hls, type HlsOptions } from './hls.js';
export { http2Push } from './http2-push.js';
export { http3 } from './http3.js';
export { grpcWeb } from './grpc-web.js';
export { scrape, type ScrapeOptions } from './scrape.js';
