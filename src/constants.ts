/**
 * Global constants for Recker HTTP Client
 * Centralizes magic numbers and configuration defaults
 */

// Retry defaults
export const DEFAULT_MAX_RETRY_DELAY_MS = 30000;
export const DEFAULT_RETRY_ATTEMPTS = 3;
export const DEFAULT_BASE_DELAY_MS = 100;

// Progress tracking
export const PROGRESS_THROTTLE_INTERVAL_MS = 100;
export const PROGRESS_UPDATES_PER_SECOND = 10;

// Timeouts
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
export const DEFAULT_CONNECT_TIMEOUT_MS = 10000;

// Cache defaults
export const DEFAULT_CACHE_TTL_MS = 60000; // 1 minute
export const DEFAULT_STALE_TTL_MS = 300000; // 5 minutes

// HTTP/2 defaults
export const DEFAULT_HTTP2_MAX_CONCURRENT_STREAMS = 100;
export const DEFAULT_HTTP1_PIPELINING = 1;

// Compression defaults
export const DEFAULT_COMPRESSION_THRESHOLD_BYTES = 1024; // 1KB
export const DEFAULT_COMPRESSION_ALGORITHM = 'gzip' as const;

// Pagination defaults
export const DEFAULT_MAX_PAGES = Infinity;
export const DEFAULT_PAGE_PARAM = 'page';
export const DEFAULT_LIMIT_PARAM = 'limit';

// Circuit breaker defaults
export const DEFAULT_FAILURE_THRESHOLD = 5;
export const DEFAULT_RESET_TIMEOUT_MS = 60000; // 1 minute
