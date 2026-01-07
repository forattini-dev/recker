/**
 * Recker Browser Slim Build
 *
 * Browser-compatible entry point with core + browser-safe plugins only.
 * Excludes AI, scrape, SEO, and presets.
 */

// ============================================================================
// Core
// ============================================================================
export * from '../core/request-promise.js';
export * from '../core/errors.js';
export * from '../core/client.js';
export * from '../core/request.js';
export * from '../core/response.js';

// ============================================================================
// Transport (Fetch + Worker for browser)
// ============================================================================
export * from '../transport/fetch.js';
export * from '../transport/worker.js';

// ============================================================================
// Portable Plugins
// ============================================================================
export * from '../plugins/retry.js';
export * from '../plugins/rate-limit.js';
export * from '../plugins/dedup.js';
export * from '../plugins/logger.js';
export * from '../plugins/circuit-breaker.js';
export * from '../plugins/cookie-jar.js';
export * from '../plugins/xsrf.js';
export * from '../plugins/graphql.js';
export * from '../plugins/xml.js';
export * from '../plugins/server-timing.js';
export * from '../plugins/jsonrpc.js';
export * from '../plugins/grpc-web.js';
export * from '../plugins/soap.js';
export * from '../plugins/odata.js';
// Browser-specific plugins
export * from '../plugins/har-recorder.js';
export * from '../plugins/network-simulation.js';

// ============================================================================
// Authentication (15/16 methods - all except mTLS)
// ============================================================================
export * from '../plugins/auth.js';

// ============================================================================
// Cache (Memory/IndexedDB only for browser)
// ============================================================================
export * from '../cache/memory-storage.js';
export * from '../cache/indexed-db.js';

// ============================================================================
// Utilities (Browser-safe only)
// ============================================================================
export * from '../utils/body.js';
export * from '../utils/header-parser.js';
export * from '../utils/link-header.js';
export * from '../utils/user-agent.js';
export * from '../utils/charset.js';

// ============================================================================
// Browser-specific utilities
// ============================================================================
export * from '../constants/http-status.js';
export * from './crypto.js';
export * from './cache.js';
export * from './compression.js';

// ============================================================================
// Unified API - Browser slim version
// ============================================================================
export * from './recker-slim.js';

// ============================================================================
// Branded alias
// ============================================================================
export { Client as Recker } from '../core/client.js';
