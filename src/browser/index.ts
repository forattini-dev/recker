/**
 * Recker Browser Build
 *
 * This is the browser-compatible entry point for Recker.
 * It exports only the features that work in browser environments.
 *
 * Features included:
 * - HTTP client with FetchTransport
 * - 19 portable plugins (retry, rate-limit, graphql, compression, etc.)
 * - WebSocket (native browser)
 * - AI layer (full support)
 * - HAR recording (Blob + download export)
 * - SEO analysis
 * - Network simulation
 * - Request body compression (gzip, deflate via CompressionStream API)
 *
 * Features excluded (Node.js only):
 * - UndiciTransport
 * - FTP/SFTP/Telnet protocols
 * - DNS/WHOIS utilities
 * - File-based cache (use IndexedDB/Service Worker)
 * - Auth plugins (Node-only)
 * - Presets (Node-only)
 * - CLI
 * - Brotli compression (browser only supports gzip/deflate for compression)
 */

// ============================================================================
// Core
// ============================================================================
export * from '../core/request-promise.js';
export * from '../core/errors.js';
export * from '../core/client.js';
export * from '../core/request.js';

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
// Cache (IndexedDB/Service Worker only for browser)
// ============================================================================
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
// SEO Analysis
// ============================================================================
export * from '../seo/analyzer.js';

// ============================================================================
// AI Integration
// ============================================================================
export * as ai from '../ai/index.js';

// NOTE: Auth plugins and presets are Node-focused and are not exported here.

// ============================================================================
// Browser-specific utilities
// ============================================================================
// ============================================================================
export * from '../constants/http-status.js';

// NOTE: The following are excluded from browser build:
// - contract/index.js - uses Node.js streaming
// - events/request-events.js - uses Node.js EventEmitter

// ============================================================================
// Browser-specific utilities
// ============================================================================
export * from './crypto.js';
export * from './cache.js';
export * from './compression.js';

// ============================================================================
// Unified API - Browser version
// ============================================================================
export * from './recker.js';

// ============================================================================
// Branded alias
// ============================================================================
export { Client as Recker } from '../core/client.js';
