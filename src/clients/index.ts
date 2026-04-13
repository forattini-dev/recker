/**
 * Product and service clients built on top of Recker transports and protocols.
 */

export {
  RedDbClient,
  createRedDbClient,
  reddb,
  type RedDbTransportMode,
  type RedDbResolvedTransport,
  type RedDbQueryStats,
  type RedDbQueryData,
  type RedDbBatchQueryData,
  type RedDbScanEntity,
  type RedDbScanData,
  type RedDbBulkInsertData,
  type RedDbCapabilities,
  type RedDbOperationMetrics,
  type RedDbOperationEnvelope,
  type RedDbQueryOptions,
  type RedDbScanRequest,
  type RedDbBulkInsertRowsRequest,
  type RedDbBinaryValue,
  type RedDbBulkInsertBinaryRequest,
  type RedDbEnsureCollectionOptions,
  type RedDbEnsureIndexOptions,
  type RedDbWarmupIndexOptions,
  type RedDbStatsOptions,
  type RedDbWireTlsOptions,
  type RedDbClientOptions
} from './reddb.js';
